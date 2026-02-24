#!/bin/bash
# 거래처 데이터 D1 → 로컬 CSV/JSON 백업
# 사용법: bash scripts/export-companies.sh

set -e

BACKUP_DIR="D:/c-auto-data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M)
CSV_FILE="${BACKUP_DIR}/companies_${TIMESTAMP}.csv"
JSON_FILE="${BACKUP_DIR}/companies_${TIMESTAMP}.json"

echo "=== 거래처 데이터 로컬 백업 ==="
echo "[1/3] D1 데이터베이스에서 거래처 조회 중..."

# D1에서 직접 JSON 쿼리
cd "$(dirname "$0")/../workers-api"

RESULT=$(npx wrangler d1 execute c-auto-db --remote --json --command \
  "SELECT company_cd, company_nm, ceo_nm, biz_no, tel, fax, email, addr, manager_nm, manager_tel, manager_email, company_type, memo, is_active, kpros_idx, created_at, updated_at FROM companies WHERE is_active = 1 ORDER BY company_nm" \
  2>/dev/null)

# JSON 저장
echo "[2/3] JSON 저장: ${JSON_FILE}"
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
rows = data[0]['results'] if data else []
print(f'  → {len(rows)}건 거래처 데이터')
with open('${JSON_FILE}', 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)
print('  → JSON 저장 완료')
"

# CSV 변환
echo "[3/3] CSV 저장: ${CSV_FILE}"
echo "$RESULT" | python3 -c "
import sys, json, csv
data = json.load(sys.stdin)
rows = data[0]['results'] if data else []
if not rows:
    print('  → 데이터 없음')
    sys.exit(0)
headers = ['company_cd','company_nm','ceo_nm','biz_no','tel','fax','email','addr','manager_nm','manager_tel','manager_email','company_type','memo']
header_kr = ['거래처코드','거래처명','대표자','사업자번호','전화','팩스','이메일','주소','담당자명','담당자전화','담당자이메일','거래유형','메모']
with open('${CSV_FILE}', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(header_kr)
    for r in rows:
        w.writerow([r.get(h, '') or '' for h in headers])
print(f'  → CSV 저장 완료 ({len(rows)}건)')
"

echo ""
echo "=== 백업 완료 ==="
echo "  JSON: ${JSON_FILE}"
echo "  CSV:  ${CSV_FILE}"
