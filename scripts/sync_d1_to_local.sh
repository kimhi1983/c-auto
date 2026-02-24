#!/bin/bash
# ═══════════════════════════════════════════════════════
# C-Auto D1 → 로컬 저장소 전체 동기화 스크립트
# D:/c-auto-data 를 로컬 데이터 서버로 사용
# 사용법: bash scripts/sync_d1_to_local.sh
# ═══════════════════════════════════════════════════════

set -e

LOCAL_ROOT="D:/c-auto-data"
TIMESTAMP=$(date +%Y%m%d_%H%M)
LOG_FILE="${LOCAL_ROOT}/logs/sync_${TIMESTAMP}.log"
WORKERS_DIR="$(dirname "$0")/../workers-api"

cd "$WORKERS_DIR"

# 로그 시작
mkdir -p "${LOCAL_ROOT}/logs"
echo "=== C-Auto D1 → 로컬 동기화 시작: $(date) ===" | tee "$LOG_FILE"

# ─── 헬퍼 함수 ───

query_d1() {
  npx wrangler d1 execute c-auto-db --remote --json --command "$1" 2>/dev/null
}

save_json_csv() {
  local TABLE=$1
  local DIR=$2
  local QUERY=$3
  local CSV_HEADERS=$4
  local CSV_FIELDS=$5

  mkdir -p "$DIR"

  local JSON_FILE="${DIR}/${TABLE}.json"
  local CSV_FILE="${DIR}/${TABLE}.csv"
  local RESULT

  RESULT=$(query_d1 "$QUERY")

  # JSON 저장
  echo "$RESULT" | python -c "
import sys, json
data = json.load(sys.stdin)
rows = data[0]['results'] if data else []
with open('${JSON_FILE}', 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)
print(f'  {len(rows)}건')
" 2>/dev/null || echo "  오류"

  # CSV 저장
  if [ -n "$CSV_HEADERS" ]; then
    echo "$RESULT" | python -c "
import sys, json, csv
data = json.load(sys.stdin)
rows = data[0]['results'] if data else []
headers_kr = '${CSV_HEADERS}'.split('|')
fields = '${CSV_FIELDS}'.split('|')
with open('${CSV_FILE}', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(headers_kr)
    for r in rows:
        w.writerow([r.get(h, '') or '' for h in fields])
" 2>/dev/null
  fi
}

# ═══════════════════════════════════════════════════════
# 1. 거래처 데이터
# ═══════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "[1/6] 거래처 데이터 동기화..." | tee -a "$LOG_FILE"

save_json_csv "companies" "${LOCAL_ROOT}/companies" \
  "SELECT id, company_cd, company_nm, ceo_nm, biz_no, tel, fax, email, addr, manager_nm, manager_tel, manager_email, company_type, memo, is_active, kpros_idx, created_at, updated_at FROM companies ORDER BY company_nm" \
  "ID|거래처코드|거래처명|대표자|사업자번호|전화|팩스|이메일|주소|담당자명|담당자전화|담당자이메일|거래유형|메모|활성|KPROS_IDX|생성일|수정일" \
  "id|company_cd|company_nm|ceo_nm|biz_no|tel|fax|email|addr|manager_nm|manager_tel|manager_email|company_type|memo|is_active|kpros_idx|created_at|updated_at"

echo "  → 거래처 완료" | tee -a "$LOG_FILE"

# ═══════════════════════════════════════════════════════
# 2. 이메일 데이터
# ═══════════════════════════════════════════════════════
echo "[2/6] 이메일 데이터 동기화..." | tee -a "$LOG_FILE"

save_json_csv "emails" "${LOCAL_ROOT}/emails" \
  "SELECT id, message_id, sender, subject, received_at, category, summary, urgency, key_info, has_attachment, is_read, created_at FROM emails ORDER BY received_at DESC" \
  "ID|메시지ID|발신자|제목|수신일|카테고리|요약|긴급도|핵심정보|첨부|읽음|생성일" \
  "id|message_id|sender|subject|received_at|category|summary|urgency|key_info|has_attachment|is_read|created_at"

echo "  → 이메일 완료" | tee -a "$LOG_FILE"

# ═══════════════════════════════════════════════════════
# 3. 재고 데이터
# ═══════════════════════════════════════════════════════
echo "[3/6] 재고 데이터 동기화..." | tee -a "$LOG_FILE"

save_json_csv "inventory_items" "${LOCAL_ROOT}/inventory" \
  "SELECT * FROM inventory_items ORDER BY name" \
  "" ""

save_json_csv "inventory_transactions" "${LOCAL_ROOT}/inventory" \
  "SELECT * FROM inventory_transactions ORDER BY created_at DESC LIMIT 5000" \
  "" ""

echo "  → 재고 완료" | tee -a "$LOG_FILE"

# ═══════════════════════════════════════════════════════
# 4. KPROS 물류 데이터
# ═══════════════════════════════════════════════════════
echo "[4/6] KPROS 물류 데이터 동기화..." | tee -a "$LOG_FILE"

for TABLE in kpros_purchases kpros_deliveries kpros_inbound kpros_outbound kpros_warehouse_in kpros_warehouse_out kpros_coa; do
  save_json_csv "$TABLE" "${LOCAL_ROOT}/inventory/kpros" \
    "SELECT * FROM ${TABLE} ORDER BY id DESC" \
    "" ""
done

echo "  → KPROS 물류 완료" | tee -a "$LOG_FILE"

# ═══════════════════════════════════════════════════════
# 5. 보고서 / 아카이브
# ═══════════════════════════════════════════════════════
echo "[5/6] 보고서/아카이브 동기화..." | tee -a "$LOG_FILE"

save_json_csv "daily_reports" "${LOCAL_ROOT}/reports" \
  "SELECT * FROM daily_reports ORDER BY created_at DESC" \
  "" ""

save_json_csv "archived_documents" "${LOCAL_ROOT}/reports" \
  "SELECT * FROM archived_documents ORDER BY created_at DESC" \
  "" ""

echo "  → 보고서 완료" | tee -a "$LOG_FILE"

# ═══════════════════════════════════════════════════════
# 6. DB 전체 SQL 덤프
# ═══════════════════════════════════════════════════════
echo "[6/6] DB 전체 SQL 덤프..." | tee -a "$LOG_FILE"

mkdir -p "${LOCAL_ROOT}/db"
SQL_DUMP="${LOCAL_ROOT}/db/c-auto-db_${TIMESTAMP}.sql"
SQL_LATEST="${LOCAL_ROOT}/db/c-auto-db_latest.sql"

# 각 테이블 스키마 + 데이터를 SQL로 덤프
{
  echo "-- C-Auto D1 Database Dump"
  echo "-- Generated: $(date)"
  echo "-- ─────────────────────────────"
  echo ""

  # 스키마 가져오기
  for TABLE in companies emails email_attachments email_approvals daily_reports archived_documents inventory_items inventory_transactions file_index exchange_rate_history users kpros_purchases kpros_deliveries kpros_inbound kpros_outbound kpros_warehouse_in kpros_warehouse_out kpros_coa; do
    SCHEMA=$(npx wrangler d1 execute c-auto-db --remote --json --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='${TABLE}'" 2>/dev/null)
    SQL=$(echo "$SCHEMA" | python -c "import sys,json; d=json.load(sys.stdin); print(d[0]['results'][0]['sql'] if d[0]['results'] else '')" 2>/dev/null)
    if [ -n "$SQL" ]; then
      echo "-- Table: ${TABLE}"
      echo "DROP TABLE IF EXISTS ${TABLE};"
      echo "${SQL};"
      echo ""
    fi
  done
} > "$SQL_DUMP"

cp "$SQL_DUMP" "$SQL_LATEST"
echo "  → SQL 덤프 완료: ${SQL_DUMP}" | tee -a "$LOG_FILE"

# ═══════════════════════════════════════════════════════
# 완료 요약
# ═══════════════════════════════════════════════════════
echo "" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "  동기화 완료: $(date)" | tee -a "$LOG_FILE"
echo "  저장 위치: ${LOCAL_ROOT}" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════════" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 각 폴더 파일 수 표시
echo "  📁 companies/  : $(ls ${LOCAL_ROOT}/companies/*.json 2>/dev/null | wc -l) 파일" | tee -a "$LOG_FILE"
echo "  📁 emails/     : $(ls ${LOCAL_ROOT}/emails/*.json 2>/dev/null | wc -l) 파일" | tee -a "$LOG_FILE"
echo "  📁 inventory/  : $(ls ${LOCAL_ROOT}/inventory/*.json 2>/dev/null | wc -l) 파일" | tee -a "$LOG_FILE"
echo "  📁 reports/    : $(ls ${LOCAL_ROOT}/reports/*.json 2>/dev/null | wc -l) 파일" | tee -a "$LOG_FILE"
echo "  📁 db/         : $(ls ${LOCAL_ROOT}/db/*.sql 2>/dev/null | wc -l) 파일" | tee -a "$LOG_FILE"
echo "  📁 logs/       : $(ls ${LOCAL_ROOT}/logs/*.log 2>/dev/null | wc -l) 파일" | tee -a "$LOG_FILE"
