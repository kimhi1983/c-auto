"""
C-Auto D1 → 로컬 저장소 전체 동기화
D:/c-auto-data 를 로컬 데이터 서버로 사용
사용법: python scripts/sync_d1_to_local.py
"""

import csv
import json
import os
import subprocess
import sys
from datetime import datetime

LOCAL_ROOT = "D:/c-auto-data"
WORKERS_DIR = "D:/c-auto/workers-api"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M")


def query_d1(sql):
    """wrangler d1 execute로 SQL 실행, JSON 결과 반환"""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    # 쌍따옴표 이스케이프 (SQL 내 쌍따옴표 → 홑따옴표)
    safe_sql = sql.replace('"', "'")
    result = subprocess.run(
        f'npx wrangler d1 execute c-auto-db --remote --json --command "{safe_sql}"',
        cwd=WORKERS_DIR, capture_output=True, shell=True, timeout=120,
        encoding="utf-8", errors="replace", env=env,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "")[:200]
        if "Assertion failed" not in stderr and stderr.strip():
            print(f"    [WARN] {stderr}")
        # returncode != 0이지만 stdout에 JSON이 있을 수 있음
        if not result.stdout or not result.stdout.strip().startswith("["):
            return []
    try:
        stdout = result.stdout.strip()
        # wrangler 출력에서 JSON 배열 부분만 추출
        start = stdout.find("[")
        if start == -1:
            return []
        data = json.loads(stdout[start:])
        return data[0]["results"] if data and data[0].get("results") else []
    except Exception as e:
        print(f"    [ERROR] JSON 파싱 실패: {e}")
        return []


def save_json(rows, filepath):
    """JSON 파일 저장"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def save_csv(rows, filepath, headers_kr, fields):
    """CSV 파일 저장 (BOM 포함)"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(headers_kr)
        for r in rows:
            w.writerow([r.get(h, "") or "" for h in fields])


def sync_table(label, directory, sql, csv_headers=None, csv_fields=None):
    """테이블 1개를 로컬에 동기화"""
    rows = query_d1(sql)
    count = len(rows)

    # JSON 저장
    json_path = f"{LOCAL_ROOT}/{directory}.json"
    save_json(rows, json_path)

    # CSV 저장
    if csv_headers and csv_fields:
        csv_path = f"{LOCAL_ROOT}/{directory}.csv"
        save_csv(rows, csv_path, csv_headers, csv_fields)

    print(f"  → {label}: {count}건")
    return count


def main():
    print(f"{'='*50}")
    print(f"  C-Auto D1 → 로컬 동기화")
    print(f"  저장 위치: {LOCAL_ROOT}")
    print(f"  시작: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    total = 0

    # ── 1. 거래처 ──
    print("\n[1/6] 거래처 데이터...")
    n = sync_table("거래처", "companies/companies",
        "SELECT id, company_cd, company_nm, ceo_nm, biz_no, tel, fax, email, addr, manager_nm, manager_tel, manager_email, company_type, memo, is_active, kpros_idx, created_at, updated_at FROM companies ORDER BY company_nm",
        ["ID", "거래처코드", "거래처명", "대표자", "사업자번호", "전화", "팩스", "이메일", "주소", "담당자명", "담당자전화", "담당자이메일", "거래유형", "메모", "활성", "KPROS_IDX", "생성일", "수정일"],
        ["id", "company_cd", "company_nm", "ceo_nm", "biz_no", "tel", "fax", "email", "addr", "manager_nm", "manager_tel", "manager_email", "company_type", "memo", "is_active", "kpros_idx", "created_at", "updated_at"]
    )
    total += n

    # ── 2. 이메일 ──
    print("\n[2/6] 이메일 데이터...")
    # 이메일 (body/body_html 제외 — 큰 텍스트)
    n = sync_table("이메일", "emails/emails",
        "SELECT id, external_id, subject, sender, recipient, category, priority, status, ai_summary, ai_confidence, processed_by, received_at, processed_at, created_at FROM emails ORDER BY received_at DESC",
        ["ID", "외부ID", "제목", "발신자", "수신자", "카테고리", "우선순위", "상태", "AI요약", "AI신뢰도", "처리자", "수신일", "처리일", "생성일"],
        ["id", "external_id", "subject", "sender", "recipient", "category", "priority", "status", "ai_summary", "ai_confidence", "processed_by", "received_at", "processed_at", "created_at"]
    )
    total += n

    n = sync_table("이메일첨부", "emails/email_attachments",
        "SELECT * FROM email_attachments ORDER BY id DESC",
    )
    total += n

    n = sync_table("이메일승인", "emails/email_approvals",
        "SELECT * FROM email_approvals ORDER BY id DESC",
    )
    total += n

    # ── 3. 재고 ──
    print("\n[3/6] 재고 데이터...")
    n = sync_table("재고품목", "inventory/inventory_items",
        "SELECT * FROM inventory_items ORDER BY name",
    )
    total += n

    n = sync_table("재고거래", "inventory/inventory_transactions",
        "SELECT * FROM inventory_transactions ORDER BY created_at DESC LIMIT 5000",
    )
    total += n

    # ── 4. KPROS 물류 ──
    print("\n[4/6] KPROS 물류 데이터...")
    for table in ["kpros_purchases", "kpros_deliveries", "kpros_inbound",
                   "kpros_outbound", "kpros_warehouse_in", "kpros_warehouse_out", "kpros_coa"]:
        n = sync_table(table, f"inventory/kpros/{table}",
            f"SELECT * FROM {table} ORDER BY id DESC",
        )
        total += n

    # ── 5. 보고서 / 아카이브 ──
    print("\n[5/6] 보고서/아카이브...")
    n = sync_table("일일보고서", "reports/daily_reports",
        "SELECT * FROM daily_reports ORDER BY created_at DESC",
    )
    total += n

    n = sync_table("아카이브문서", "reports/archived_documents",
        "SELECT * FROM archived_documents ORDER BY created_at DESC",
    )
    total += n

    # ── 6. 사용자 / 환율 ──
    print("\n[6/6] 기타 데이터...")
    n = sync_table("사용자", "db/users",
        "SELECT id, email, full_name, role, department, is_active, created_at FROM users ORDER BY id",
    )
    total += n

    n = sync_table("환율이력", "db/exchange_rate_history",
        "SELECT * FROM exchange_rate_history ORDER BY id DESC LIMIT 1000",
    )
    total += n

    n = sync_table("파일인덱스", "db/file_index",
        "SELECT * FROM file_index ORDER BY id DESC LIMIT 5000",
    )
    total += n

    # ── 요약 ──
    print(f"\n{'='*50}")
    print(f"  동기화 완료!")
    print(f"  총 레코드: {total}건")
    print(f"  저장 위치: {LOCAL_ROOT}")
    print(f"  완료: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}")

    # 폴더별 파일 수 표시
    print(f"\n  폴더 구조:")
    for d in ["companies", "emails", "inventory", "inventory/kpros", "reports", "db"]:
        full = f"{LOCAL_ROOT}/{d}"
        if os.path.isdir(full):
            files = [f for f in os.listdir(full) if os.path.isfile(os.path.join(full, f))]
            print(f"    {d}/  → {len(files)} 파일")

    # 로그 저장
    os.makedirs(f"{LOCAL_ROOT}/logs", exist_ok=True)
    with open(f"{LOCAL_ROOT}/logs/sync_{TIMESTAMP}.log", "w", encoding="utf-8") as f:
        f.write(f"동기화 완료: {datetime.now().isoformat()}\n")
        f.write(f"총 레코드: {total}건\n")


if __name__ == "__main__":
    main()
