"""
이카운트 크롤링 거래처 데이터를 D1 companies 테이블에 임포트
- JSON → SQL INSERT 생성 → wrangler d1 execute로 실행
"""

import json
import subprocess
import sys

JSON_PATH = "D:/c-auto-data/ecount/ecount_customers_latest.json"
SQL_PATH = "D:/c-auto-data/ecount/import_ecount_customers.sql"
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
        customers = json.load(f)

    print(f"총 {len(customers)}건 이카운트 거래처 데이터 로드")

    # SQL 생성
    sql_lines = []
    for c in customers:
        cust_cd = c.get("거래처코드", "").strip()
        cust_nm = c.get("거래처명", "").strip()
        if not cust_nm:
            continue

        ceo_nm = c.get("대표자명", "").strip()
        tel = c.get("전화", "").strip()
        mobile = c.get("모바일", "").strip()
        use_yn = c.get("사용구분", "YES").strip()
        transfer_info = c.get("이체정보", "").strip()

        is_active = 1 if use_yn == "YES" else 0

        # memo에 이체정보 포함
        memo_parts = []
        if transfer_info:
            memo_parts.append(f"이체정보: {transfer_info}")
        memo = " / ".join(memo_parts)

        # companyCd에 거래처코드, bizNo에도 동일 값 (사업자번호 형태)
        sql = (
            f"INSERT INTO companies "
            f"(company_cd, company_nm, ceo_nm, biz_no, tel, manager_tel, "
            f"memo, is_active, created_at, updated_at) "
            f"VALUES ("
            f"{escape_sql(cust_cd)}, {escape_sql(cust_nm)}, {escape_sql(ceo_nm)}, "
            f"{escape_sql(cust_cd)}, {escape_sql(tel)}, {escape_sql(mobile)}, "
            f"{escape_sql(memo)}, {is_active}, datetime('now'), datetime('now'));"
        )
        sql_lines.append(sql)

    # SQL 파일 저장
    with open(SQL_PATH, "w", encoding="utf-8") as f:
        f.write("-- 이카운트 거래처 벌크 임포트\n")
        f.write(f"-- {len(sql_lines)}건\n\n")
        # 기존 이카운트 거래처 삭제 (kpros_idx가 NULL이고 company_cd가 있는 것)
        f.write("DELETE FROM companies WHERE kpros_idx IS NULL AND company_cd IS NOT NULL;\n\n")
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
        print("D1 업로드 완료!")
        print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
    else:
        print(f"오류 발생:\n{result.stderr[-500:]}")
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
