"""
크롤링된 KPROS 거래처 데이터를 D1 SQL 파일로 변환
- JSON → SQL INSERT 생성 → wrangler d1 execute로 실행
"""

import json
import os
import subprocess
import sys

JSON_PATH = "D:/c-auto-data/backups/kpros_companies_20260224_1334.json"
SQL_PATH = "D:/c-auto-data/backups/import_companies.sql"
WORKERS_DIR = "D:/c-auto/workers-api"


def escape_sql(val):
    """SQL 문자열 이스케이프"""
    if not val:
        return "NULL"
    val = str(val).replace("'", "''")
    return f"'{val}'"


def main():
    # JSON 로드
    with open(JSON_PATH, encoding="utf-8") as f:
        companies = json.load(f)

    print(f"총 {len(companies)}건 거래처 데이터 로드")

    # SQL 생성
    sql_lines = []
    for c in companies:
        kpros_idx = c.get("kpros_idx", "")
        company_nm = c.get("company_nm", "").strip()
        if not company_nm:
            continue

        tel = c.get("tel", "")
        fax = c.get("fax", "")
        email = c.get("email", "")
        addr = c.get("addr", "")
        manager_nm = c.get("manager_nm", "")
        mobile = c.get("mobile", "")
        buy_sell = c.get("buy_sell_type", "")
        dept = c.get("dept", "")
        rank_str = c.get("manager_rank", "")
        business = c.get("business", "")

        # memo에 부가 정보 합침
        memo_parts = [p for p in [dept, rank_str, business] if p]
        memo = " / ".join(memo_parts)

        kpros_idx_val = int(kpros_idx) if kpros_idx else "NULL"

        sql = (
            f"INSERT OR REPLACE INTO companies "
            f"(company_nm, tel, fax, email, addr, manager_nm, manager_tel, "
            f"company_type, memo, kpros_idx, is_active, created_at, updated_at) "
            f"VALUES ("
            f"{escape_sql(company_nm)}, {escape_sql(tel)}, {escape_sql(fax)}, "
            f"{escape_sql(email)}, {escape_sql(addr)}, {escape_sql(manager_nm)}, "
            f"{escape_sql(mobile)}, {escape_sql(buy_sell)}, {escape_sql(memo)}, "
            f"{kpros_idx_val}, 1, datetime('now'), datetime('now'));"
        )
        sql_lines.append(sql)

    # SQL 파일 저장
    with open(SQL_PATH, "w", encoding="utf-8") as f:
        f.write("-- KPROS 거래처 벌크 임포트\n")
        f.write(f"-- {len(sql_lines)}건\n\n")
        # 기존 KPROS 데이터 초기화 (kpros_idx가 있는 것만)
        f.write("DELETE FROM companies WHERE kpros_idx IS NOT NULL;\n\n")
        for line in sql_lines:
            f.write(line + "\n")

    print(f"SQL 파일 생성: {SQL_PATH} ({len(sql_lines)}건)")

    # wrangler d1 execute로 실행
    print("\nD1 데이터베이스에 업로드 중...")
    sql_file_unix = SQL_PATH.replace("\\", "/")

    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "c-auto-db", "--remote",
         "--file", sql_file_unix],
        cwd=WORKERS_DIR,
        capture_output=True, text=True, timeout=120
    )

    if result.returncode == 0:
        print("✓ D1 업로드 완료!")
        print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
    else:
        print(f"✗ 오류 발생:\n{result.stderr[-500:]}")
        sys.exit(1)

    # 확인
    result2 = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "c-auto-db", "--remote",
         "--command", "SELECT COUNT(*) as cnt FROM companies"],
        cwd=WORKERS_DIR,
        capture_output=True, text=True, timeout=30
    )
    print(f"\n확인: {result2.stdout}")


if __name__ == "__main__":
    main()
