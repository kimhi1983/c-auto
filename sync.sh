#!/bin/bash
# ═══════════════════════════════════════════
# C-Auto 작업 동기화 스크립트
# 장소 이동 후 실행: bash sync.sh
# ═══════════════════════════════════════════

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  C-Auto 작업 동기화${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
echo ""

# ─────────────────────────────────────────
# 1. 현재 브랜치 확인
# ─────────────────────────────────────────
BRANCH=$(git branch --show-current)
echo -e "${BLUE}[1/6]${NC} 브랜치: ${BOLD}${BRANCH}${NC}"

# ─────────────────────────────────────────
# 2. 로컬 변경사항 stash → pull
# ─────────────────────────────────────────
if [ -n "$(git diff --name-only)" ] || [ -n "$(git diff --cached --name-only)" ]; then
  echo -e "${YELLOW}  ⚠ 로컬 변경사항 발견 - stash 후 pull 진행${NC}"
  git stash push -m "auto-stash-$(date +%Y%m%d-%H%M%S)"
  STASHED=true
else
  echo -e "  로컬 변경사항 없음"
  STASHED=false
fi

echo -e "${BLUE}[2/6]${NC} Git pull..."
git pull origin "$BRANCH" --rebase 2>&1 | sed 's/^/  /'

if [ "$STASHED" = true ]; then
  echo -e "${YELLOW}  stash 복원 중...${NC}"
  git stash pop || echo -e "${RED}  ✗ stash 충돌 - 수동 해결 필요: git stash pop${NC}"
fi

# ─────────────────────────────────────────
# 3. 불필요한 로컬 파일 정리
# ─────────────────────────────────────────
echo -e "${BLUE}[3/6]${NC} 로컬 파일 정리..."

CLEANED=0

# Next.js 빌드 캐시
if [ -d "frontend-next/.next" ]; then
  rm -rf frontend-next/.next
  echo -e "  ${DIM}삭제: frontend-next/.next (빌드 캐시)${NC}"
  CLEANED=$((CLEANED + 1))
fi

# Next.js static export 출력
if [ -d "frontend-next/out" ]; then
  rm -rf frontend-next/out
  echo -e "  ${DIM}삭제: frontend-next/out (static export)${NC}"
  CLEANED=$((CLEANED + 1))
fi

# node_modules 캐시/임시
for dir in frontend-next/.cache workers-api/.cache; do
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    echo -e "  ${DIM}삭제: $dir${NC}"
    CLEANED=$((CLEANED + 1))
  fi
done

# Wrangler 임시 파일
if [ -d "workers-api/.wrangler" ]; then
  rm -rf workers-api/.wrangler
  echo -e "  ${DIM}삭제: workers-api/.wrangler (배포 캐시)${NC}"
  CLEANED=$((CLEANED + 1))
fi

# Python 캐시
for dir in $(find . -name "__pycache__" -type d 2>/dev/null); do
  rm -rf "$dir"
  echo -e "  ${DIM}삭제: $dir${NC}"
  CLEANED=$((CLEANED + 1))
done

# .pyc 파일
PYC_COUNT=$(find . -name "*.pyc" -type f 2>/dev/null | wc -l)
if [ "$PYC_COUNT" -gt 0 ]; then
  find . -name "*.pyc" -type f -delete 2>/dev/null
  echo -e "  ${DIM}삭제: .pyc 파일 ${PYC_COUNT}개${NC}"
  CLEANED=$((CLEANED + 1))
fi

# OS 생성 파일
for f in .DS_Store Thumbs.db desktop.ini; do
  FOUND=$(find . -name "$f" -type f 2>/dev/null | wc -l)
  if [ "$FOUND" -gt 0 ]; then
    find . -name "$f" -type f -delete 2>/dev/null
    echo -e "  ${DIM}삭제: $f ${FOUND}개${NC}"
    CLEANED=$((CLEANED + 1))
  fi
done

# 로그 파일
for pattern in "*.log" "npm-debug.log*" "yarn-debug.log*"; do
  FOUND=$(find . -maxdepth 3 -name "$pattern" -type f 2>/dev/null | wc -l)
  if [ "$FOUND" -gt 0 ]; then
    find . -maxdepth 3 -name "$pattern" -type f -delete 2>/dev/null
    echo -e "  ${DIM}삭제: $pattern ${FOUND}개${NC}"
    CLEANED=$((CLEANED + 1))
  fi
done

if [ "$CLEANED" -eq 0 ]; then
  echo -e "  정리할 파일 없음"
else
  echo -e "  ${GREEN}${CLEANED}건 정리 완료${NC}"
fi

# ─────────────────────────────────────────
# 4. 의존성 설치
# ─────────────────────────────────────────
echo -e "${BLUE}[4/6]${NC} 의존성 확인..."

if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "frontend-next/package.json"; then
  echo -e "  ${YELLOW}frontend-next 패키지 변경 감지 → npm install${NC}"
  (cd frontend-next && npm install --silent)
else
  echo -e "  frontend-next: 변경 없음"
fi

if git diff HEAD@{1} --name-only 2>/dev/null | grep -q "workers-api/package.json"; then
  echo -e "  ${YELLOW}workers-api 패키지 변경 감지 → npm install${NC}"
  (cd workers-api && npm install --silent)
else
  echo -e "  workers-api: 변경 없음"
fi

# ─────────────────────────────────────────
# 5. D1 → 로컬 SQLite 동기화
# ─────────────────────────────────────────
echo -e "${BLUE}[5/6]${NC} D1 데이터베이스 → 로컬 동기화..."

D1_DATA_DIR="D:/c-auto-data"
D1_BACKUP_DIR="$D1_DATA_DIR/backups"
D1_DB_NAME="c-auto-db"
D1_TIMESTAMP=$(date +%Y%m%d_%H%M)
D1_SQL_FILE="$D1_BACKUP_DIR/${D1_DB_NAME}_${D1_TIMESTAMP}.sql"

mkdir -p "$D1_BACKUP_DIR"

if (cd workers-api && npx wrangler d1 export "$D1_DB_NAME" --remote --output "$D1_SQL_FILE" 2>&1 | tail -1); then
  D1_SIZE=$(du -h "$D1_SQL_FILE" 2>/dev/null | cut -f1)
  cp "$D1_SQL_FILE" "$D1_BACKUP_DIR/${D1_DB_NAME}_latest.sql"

  # sqlite3 있으면 DB 파일 생성
  if command -v sqlite3 &> /dev/null; then
    rm -f "$D1_DATA_DIR/c-auto.db"
    sqlite3 "$D1_DATA_DIR/c-auto.db" < "$D1_SQL_FILE"
  fi

  # 7일 이상 백업 정리
  find "$D1_BACKUP_DIR" -name "${D1_DB_NAME}_*.sql" -not -name "*latest*" -mtime +7 -delete 2>/dev/null

  D1_COUNT=$(find "$D1_BACKUP_DIR" -name "${D1_DB_NAME}_*.sql" -not -name "*latest*" -type f 2>/dev/null | wc -l)
  echo -e "  ${GREEN}D1 동기화 완료: ${D1_SIZE} (백업 ${D1_COUNT}개)${NC}"
else
  echo -e "  ${YELLOW}D1 동기화 건너뜀 (오프라인 또는 인증 필요)${NC}"
fi

# ─────────────────────────────────────────
# 6. 최근 작업 내역
# ─────────────────────────────────────────
echo -e "${BLUE}[6/6]${NC} 최근 커밋:"
echo ""
git log --oneline --graph -8 | sed 's/^/  /'
echo ""

# ═══════════════════════════════════════════
# 에이전트 팀 구성 + 프로젝트 상태
# ═══════════════════════════════════════════
echo -e "${CYAN}───────────────────────────────────────────────────────${NC}"
echo -e "${CYAN}  에이전트 개발팀 구성${NC}"
echo -e "${CYAN}───────────────────────────────────────────────────────${NC}"
echo ""
echo -e "                    ${BOLD}CTO (Claude)${NC}"
echo -e "                     총괄 지휘"
echo -e "                        │"
echo -e "          ┌─────────────┼─────────────┐"
echo -e "          │             │             │"
echo -e "     ${BOLD}PM 기획${NC}      ${BOLD}Architect${NC}      ${BOLD}UX 디자인${NC}"
echo -e "      분석           설계           사용성"
echo -e "          │             │             │"
echo -e "          └─────────────┼─────────────┘"
echo -e "                        │"
echo -e "              ┌─────────┴─────────┐"
echo -e "              │                   │"
echo -e "         ${BOLD}Backend${NC}           ${BOLD}Frontend${NC}"
echo -e "        Workers+Hono       Next.js+React"
echo -e "              │                   │"
echo -e "              └─────────┬─────────┘"
echo -e "                        │"
echo -e "                   ${BOLD}QA 품질${NC}"
echo -e "                  빌드/보안 검증"
echo -e "                        │"
echo -e "                  ${BOLD}DevOps 배포${NC}"
echo -e "               Cloudflare 배포"
echo ""
echo -e "${CYAN}───────────────────────────────────────────────────────${NC}"
echo -e "${CYAN}  프로젝트 현황${NC}"
echo -e "${CYAN}───────────────────────────────────────────────────────${NC}"
echo ""
echo -e "  프로젝트   : ${BOLD}KPROS 업무 자동화 플랫폼 (C-Auto)${NC}"
echo -e "  프론트엔드 : https://c-auto.pages.dev"
echo -e "  Workers API: https://c-auto-workers-api.kimhi1983.workers.dev"
echo -e "  브랜치     : ${BOLD}${BRANCH}${NC}"
echo ""
echo -e "  ${DIM}Tech Stack:${NC}"
echo -e "  Frontend  → Next.js 16 + React 19 + Tailwind CSS"
echo -e "  Backend   → Cloudflare Workers + Hono + D1"
echo -e "  AI Engine → Gemini Flash 90% / Claude Haiku 8% / Sonnet 2%"
echo ""

# 파일 수 통계
FE_FILES=$(find frontend-next/app -name "*.tsx" -type f 2>/dev/null | wc -l)
BE_FILES=$(find workers-api/src -name "*.ts" -type f 2>/dev/null | wc -l)
echo -e "  ${DIM}코드베이스:${NC}"
echo -e "  Frontend  → ${BOLD}${FE_FILES}${NC}개 TSX 파일"
echo -e "  Backend   → ${BOLD}${BE_FILES}${NC}개 TS 파일"
echo ""

# ═══════════════════════════════════════════
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  동기화 완료! 작업을 이어서 진행하세요${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
