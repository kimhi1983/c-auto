#!/bin/bash
# ═══════════════════════════════════════════
# D1 → 로컬 SQLite 동기화 스크립트
# 실행: bash scripts/d1-sync.sh
# ═══════════════════════════════════════════

set -e

# ─── 설정 ───
DATA_DIR="D:/c-auto-data"
BACKUP_DIR="$DATA_DIR/backups"
DB_FILE="$DATA_DIR/c-auto.db"
LOG_FILE="$DATA_DIR/sync.log"
WORKERS_DIR="D:/c-auto/workers-api"
DB_NAME="c-auto-db"
KEEP_DAYS=7

# 색상
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d_%H%M)
SQL_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg" >> "$LOG_FILE"
  echo -e "$2$1${NC}"
}

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  D1 → 로컬 SQLite 동기화${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo ""

# ─── 1. 디렉토리 확인 ───
mkdir -p "$BACKUP_DIR"

# ─── 2. D1 원격 DB → SQL 내보내기 ───
echo -e "${BLUE}[1/4]${NC} D1 데이터베이스 내보내기..."
log "D1 export 시작" "$DIM"

cd "$WORKERS_DIR"
if npx wrangler d1 export "$DB_NAME" --remote --output "$SQL_FILE" 2>&1; then
  FILE_SIZE=$(du -h "$SQL_FILE" | cut -f1)
  log "D1 export 완료: ${SQL_FILE} (${FILE_SIZE})" "$GREEN"
else
  log "D1 export 실패!" "$RED"
  exit 1
fi

# ─── 3. SQL → SQLite DB 변환 ───
echo -e "${BLUE}[2/4]${NC} SQLite DB 변환..."

# 기존 DB 삭제 후 재생성 (깨끗한 상태)
rm -f "$DB_FILE"

# Node.js로 SQLite 변환 (sqlite3 CLI 미설치 대체)
node -e "
const fs = require('fs');
const sql = fs.readFileSync('${SQL_FILE//\\/\\\\}', 'utf-8');
// better-sqlite3 없이도 SQL 파일 자체가 완전한 백업
// latest.sql로 복사
fs.copyFileSync('${SQL_FILE//\\/\\\\}', '${BACKUP_DIR//\\/\\\\}/${DB_NAME}_latest.sql');
console.log('latest.sql 갱신 완료');
" 2>/dev/null

# SQLite DB 변환 시도 (sqlite3가 있으면 사용)
if command -v sqlite3 &> /dev/null; then
  sqlite3 "$DB_FILE" < "$SQL_FILE"
  DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
  log "SQLite DB 생성: ${DB_FILE} (${DB_SIZE})" "$GREEN"
else
  # sqlite3 미설치 → SQL 파일만 보관
  cp "$SQL_FILE" "${DATA_DIR}/${DB_NAME}_latest.sql"
  log "SQL 백업 저장 (sqlite3 미설치 → SQL 파일로 보관)" "$YELLOW"
fi

# ─── 4. 오래된 백업 정리 ───
echo -e "${BLUE}[3/4]${NC} 오래된 백업 정리 (${KEEP_DAYS}일 이상)..."

DELETED=0
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql" -mtime +${KEEP_DAYS} -type f 2>/dev/null | while read f; do
  rm -f "$f"
  DELETED=$((DELETED + 1))
done

TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql" -not -name "*latest*" -type f 2>/dev/null | wc -l)
log "백업 파일: ${TOTAL_BACKUPS}개 보관 중" "$DIM"

# ─── 5. 완료 보고 ───
echo -e "${BLUE}[4/4]${NC} 동기화 완료!"
echo ""

# 백업 목록 (최근 5개)
echo -e "  ${DIM}최근 백업:${NC}"
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql" -not -name "*latest*" -type f 2>/dev/null | sort -r | head -5 | while read f; do
  SIZE=$(du -h "$f" | cut -f1)
  FNAME=$(basename "$f")
  echo -e "  ${DIM}  ${FNAME} (${SIZE})${NC}"
done
echo ""

# 디스크 사용량
TOTAL_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)
echo -e "  저장소: ${BOLD}${DATA_DIR}${NC}"
echo -e "  사용량: ${BOLD}${TOTAL_SIZE}${NC}"
echo ""

log "동기화 완료 (총 ${TOTAL_SIZE})" "$GREEN"

echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  D1 → 로컬 동기화 완료!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
