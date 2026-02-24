"""
KPROS 거래처 크롤링 스크립트 (Playwright)
- 로그인 → 거래처정보 페이지 → 두 테이블 데이터 결합 추출 → 페이지네이션 → CSV/JSON 저장
- 사용법: python scripts/crawl_kpros_companies.py
"""

import csv
import json
import os
import sys
from datetime import datetime
from playwright.sync_api import sync_playwright

KPROS_URL = "http://kpros.erns.co.kr"
USER_ID = "admin"
PASSWORD = "0000"

BACKUP_DIR = "D:/c-auto-data/backups"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M")


def crawl_companies():
    """Playwright로 KPROS 거래처 페이지 크롤링"""

    os.makedirs(BACKUP_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # ── 1) 로그인 ──
        print("[1/4] KPROS 로그인 중...")
        page.goto(f"{KPROS_URL}/login/loginPage.do")
        page.fill("#userId", USER_ID)
        page.fill("#userPassword", PASSWORD)
        page.click("#btn-login")
        page.wait_for_url("**/main/**", timeout=10000)
        print("  → 로그인 성공")

        # ── 2) 거래처정보 페이지 이동 ──
        print("[2/4] 거래처정보 페이지 이동...")
        page.goto(f"{KPROS_URL}/company/companyList.do?menu=basicInfo")
        page.wait_for_load_state("networkidle")

        # 페이지 사이즈 60개로 변경
        try:
            page.click(".select_page_size .custom-select-trigger", timeout=3000)
            page.click(".custom-option[data-value='60']", timeout=3000)
            page.wait_for_timeout(2000)
        except Exception:
            print("  → 페이지 사이즈 변경 실패, 기본값으로 진행")

        # ── 3) 두 테이블에서 데이터 추출 (모든 페이지) ──
        print("[3/4] 거래처 데이터 수집 중...")
        all_companies = []
        page_num = 1

        while True:
            page.wait_for_timeout(1500)

            # JavaScript로 두 테이블의 데이터를 합쳐서 추출
            page_data = page.evaluate("""() => {
                const fixedRows = document.querySelectorAll('#companyFixedData tr.companyRow');
                const scrollRows = document.querySelectorAll('#companyData tr.companyRow');
                const results = [];

                for (let i = 0; i < fixedRows.length; i++) {
                    const fr = fixedRows[i];
                    const sr = scrollRows[i];
                    if (!fr || !sr) continue;

                    const fCells = fr.querySelectorAll('td');
                    const sCells = sr.querySelectorAll('td');
                    const companyIdx = fr.getAttribute('data-idx') || '';

                    results.push({
                        kpros_idx: companyIdx,
                        // Fixed 테이블: 지역, 업체명, 구분, 소속팀, 담당자, 직위
                        region: fCells[0] ? fCells[0].innerText.trim() : '',
                        company_nm: fCells[1] ? fCells[1].innerText.trim() : '',
                        gubun: fCells[2] ? fCells[2].innerText.trim() : '',
                        dept: fCells[3] ? fCells[3].innerText.trim() : '',
                        manager_nm: fCells[4] ? fCells[4].innerText.trim() : '',
                        manager_rank: fCells[5] ? fCells[5].innerText.trim() : '',
                        // Scrollable 테이블: 업무, 휴대폰, 전화번호, 이메일, 팩스, 주소, 매입/판매처, 등록자, 등록일, 유효여부
                        business: sCells[0] ? sCells[0].innerText.trim() : '',
                        mobile: sCells[1] ? sCells[1].innerText.trim() : '',
                        tel: sCells[2] ? sCells[2].innerText.trim() : '',
                        email: sCells[3] ? sCells[3].innerText.trim() : '',
                        fax: sCells[4] ? sCells[4].innerText.trim() : '',
                        addr: sCells[5] ? sCells[5].innerText.trim() : '',
                        buy_sell_type: sCells[6] ? sCells[6].innerText.trim() : '',
                        reg_nm: sCells[7] ? sCells[7].innerText.trim() : '',
                        reg_date: sCells[8] ? sCells[8].innerText.trim() : '',
                        is_active: sCells[9] ? sCells[9].innerText.trim() : '',
                    });
                }
                return results;
            }""")

            if not page_data:
                print(f"  → 페이지 {page_num}: 데이터 없음")
                break

            all_companies.extend(page_data)
            print(f"  → 페이지 {page_num}: {len(page_data)}건 수집")

            # 다음 페이지 클릭 (#paging 안의 a 태그, jQuery paging 플러그인)
            has_next = page.evaluate(f"""() => {{
                const container = document.getElementById('paging');
                if (!container) return false;
                const links = container.querySelectorAll('a');

                // 1) 숫자 페이지 중 다음 번호 찾기
                for (const a of links) {{
                    const txt = a.textContent.replace(/[\\[\\]]/g, '').trim();
                    if (txt === '{page_num + 1}') {{
                        a.click();
                        return true;
                    }}
                }}

                // 2) paging-side 버튼 (> 또는 >>)
                const sideLinks = container.querySelectorAll('a.paging-side');
                for (const a of sideLinks) {{
                    const txt = a.textContent;
                    // [>N] 형태 — 다음 페이지 그룹
                    if (txt.includes('>')) {{
                        a.click();
                        return true;
                    }}
                }}

                return false;
            }}""")

            if not has_next:
                break
            page_num += 1

        print(f"\n  ★ 총 {len(all_companies)}건 거래처 수집 완료")
        browser.close()

    if not all_companies:
        print("\n[ERROR] 거래처 데이터를 추출하지 못했습니다.")
        sys.exit(1)

    # ── 4) 파일 저장 ──
    print(f"\n[4/4] 파일 저장 중...")
    save_results(all_companies)
    return all_companies


def save_results(companies):
    """크롤링 결과를 CSV, JSON으로 저장"""
    json_path = f"{BACKUP_DIR}/kpros_companies_{TIMESTAMP}.json"
    csv_path = f"{BACKUP_DIR}/kpros_companies_{TIMESTAMP}.csv"

    # JSON 저장
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False, indent=2)
    print(f"  → JSON: {json_path} ({len(companies)}건)")

    # CSV 저장 (BOM 포함 → Excel 한글 호환)
    fields = [
        "kpros_idx", "region", "company_nm", "gubun", "dept",
        "manager_nm", "manager_rank", "business", "mobile", "tel",
        "email", "fax", "addr", "buy_sell_type", "reg_nm", "reg_date", "is_active"
    ]
    headers_kr = [
        "KPROS_IDX", "지역", "업체명", "구분", "소속팀",
        "담당자", "직위", "업무", "휴대폰", "전화번호",
        "이메일", "팩스", "주소", "매입/판매처", "등록자", "등록일", "유효여부"
    ]

    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers_kr)
        for c in companies:
            writer.writerow([c.get(h, "") for h in fields])
    print(f"  → CSV:  {csv_path} ({len(companies)}건)")

    # 콘솔 샘플 출력
    print(f"\n=== 샘플 데이터 (처음 5건) ===")
    for i, c in enumerate(companies[:5]):
        print(f"  {i+1}. [{c.get('region','')}] {c.get('company_nm','')} | "
              f"담당: {c.get('manager_nm','')} | "
              f"전화: {c.get('tel','')} | "
              f"이메일: {c.get('email','')}")


if __name__ == "__main__":
    crawl_companies()
