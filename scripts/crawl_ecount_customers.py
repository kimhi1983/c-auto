"""
이카운트 ERP 거래처 데이터 Playwright 크롤링
- 로그인 → 거래처등록 URL 직접 접근 → 테이블 추출 → JSON/CSV 저장
사용법: python scripts/crawl_ecount_customers.py
"""

import csv
import json
import os
from datetime import datetime

from playwright.sync_api import sync_playwright

COM_CODE = "627250"
USER_ID = "kimhi1983"
PASSWORD = "kak830912!"
LOGIN_URL = "https://login.ecount.com"
# 거래처등록 페이지 해시 라우트
CUST_HASH = "#menuType=MENUTREE_000004&menuSeq=MENUTREE_000170&groupSeq=MENUTREE_000029&prgId=E010101&depth=3"

SAVE_DIR = "D:/c-auto-data/ecount"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M")


def main():
    os.makedirs(SAVE_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="ko-KR",
        )
        page = context.new_page()

        # ── 1단계: 로그인 ──
        print("[1] 이카운트 로그인...")
        page.goto(LOGIN_URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        page.fill("#com_code", COM_CODE)
        page.fill("#id", USER_ID)
        page.fill("#passwd", PASSWORD)
        page.click("button.btn-primary")
        print("  → 로그인 버튼 클릭")
        page.wait_for_timeout(5000)

        # "새로운 기기 로그인 알림" 팝업 닫기
        try:
            dismiss_btn = page.query_selector('button:has-text("등록안함")')
            if dismiss_btn:
                dismiss_btn.click()
                print("  → '등록안함' 클릭")
                page.wait_for_timeout(3000)
        except:
            pass

        # 현재 URL에서 base 추출
        current = page.url
        base_url = current.split("#")[0]  # 해시 제거
        print(f"  → 로그인 완료. base: {base_url}")

        # ── 2단계: 거래처등록 페이지로 이동 ──
        print("\n[2] 거래처등록 페이지 이동...")
        cust_url = base_url + CUST_HASH
        print(f"  → URL: {cust_url[:80]}...")
        page.goto(cust_url, timeout=15000)
        page.wait_for_timeout(8000)  # SPA 라우팅 + 데이터 로딩 대기

        page.screenshot(path=f"{SAVE_DIR}/debug_01_cust_page.png")

        # ── 3단계: DOM에서 거래처코드 확인 ──
        print("\n[3] 거래처 데이터 확인...")
        html = page.content()
        has_cust = "거래처코드" in html
        print(f"  → HTML: {len(html)} bytes, '거래처코드': {has_cust}")

        if not has_cust:
            # 프레임 내부 확인
            for i, frame in enumerate(page.frames):
                try:
                    fhtml = frame.content()
                    if "거래처코드" in fhtml:
                        print(f"  → frame[{i}] ({frame.name})에서 발견!")
                        has_cust = True
                        # 이 프레임의 HTML 저장
                        with open(f"{SAVE_DIR}/debug_frame_{i}.html", "w", encoding="utf-8") as f:
                            f.write(fhtml)
                        break
                except:
                    pass

        if not has_cust:
            print("  → '거래처코드' 없음. HTML 저장 후 분석...")
            with open(f"{SAVE_DIR}/debug_full.html", "w", encoding="utf-8") as f:
                f.write(html)
            # 프레임 정보
            for i, frame in enumerate(page.frames):
                print(f"    frame[{i}]: name={frame.name}, url={frame.url[:60]}")
                try:
                    fhtml = frame.content()
                    if len(fhtml) > 1000:
                        with open(f"{SAVE_DIR}/debug_frame_{i}.html", "w", encoding="utf-8") as f:
                            f.write(fhtml)
                except:
                    pass
            browser.close()
            return

        # ── 4단계: 거래처 테이블 추출 ──
        print("\n[4] 거래처 테이블 추출...")

        all_customers = extract_cust_data(page)

        # 프레임에서 시도
        if not all_customers:
            for frame in page.frames:
                try:
                    data = extract_cust_data(frame)
                    if data:
                        all_customers = data
                        break
                except:
                    pass

        print(f"  → 첫 페이지: {len(all_customers)}건")

        if all_customers:
            print(f"  → 컬럼: {list(all_customers[0].keys())}")

        # ── 5단계: 페이지네이션 ──
        if all_customers:
            print(f"\n[5] 페이지네이션...")
            page_num = 1

            while page_num < 200:
                prev_last = all_customers[-1].get("거래처코드", "")

                has_next = page.evaluate("""(pn) => {
                    const els = document.querySelectorAll('a, button, span');
                    for (const el of els) {
                        const t = el.innerText?.trim();
                        if ((t === '>' || t === '▶' || t === '다음' || t === 'Next') &&
                            !el.classList?.contains('disabled') && el.offsetParent !== null) {
                            el.click();
                            return true;
                        }
                    }
                    const next = pn + 1;
                    for (const el of els) {
                        if (el.innerText?.trim() === String(next) && el.offsetParent !== null) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }""", page_num)

                if not has_next:
                    print(f"  → 마지막 페이지 ({page_num}페이지)")
                    break

                page.wait_for_timeout(2000)
                new_data = extract_cust_data(page)
                if not new_data:
                    for frame in page.frames:
                        try:
                            new_data = extract_cust_data(frame)
                            if new_data:
                                break
                        except:
                            pass

                if not new_data:
                    break

                new_first = new_data[0].get("거래처코드", "")
                if new_first == prev_last:
                    break

                all_customers.extend(new_data)
                page_num += 1
                print(f"  → 페이지 {page_num}: +{len(new_data)}건 (총 {len(all_customers)}건)")

        # ── 6단계: 저장 ──
        if all_customers:
            for c in all_customers:
                if "" in c:
                    c["번호"] = c.pop("")
            save_results(all_customers)
        else:
            print("\n  [ERROR] 데이터 없음")
            page.screenshot(path=f"{SAVE_DIR}/debug_error.png")

        browser.close()


def extract_cust_data(target):
    """거래처코드/거래처명 헤더가 있는 테이블에서 데이터 추출"""
    try:
        data = target.evaluate("""() => {
            const results = [];
            const tables = document.querySelectorAll('table');

            for (const table of tables) {
                // 헤더 추출
                const headers = [];
                const ths = table.querySelectorAll('thead th, thead td');
                if (ths.length > 0) {
                    ths.forEach(c => headers.push(c.innerText.trim().replace(/\\n/g, ' ')));
                } else {
                    const first = table.querySelector('tr');
                    if (first) first.querySelectorAll('th, td').forEach(c =>
                        headers.push(c.innerText.trim().replace(/\\n/g, ' ')));
                }

                // 거래처 테이블인지 확인
                if (!headers.some(h => h.includes('거래처코드') || h.includes('거래처명'))) continue;

                // 데이터 추출
                const rows = table.querySelectorAll('tbody tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 3) continue;
                    const rowData = {};
                    let hasData = false;
                    cells.forEach((cell, j) => {
                        const key = j < headers.length ? headers[j] : 'col_' + j;
                        const val = cell.innerText.trim();
                        rowData[key] = val;
                        if (val) hasData = true;
                    });
                    if (hasData) results.push(rowData);
                }
                if (results.length > 0) break;
            }
            return results;
        }""")
        return data if data else []
    except:
        return []


def save_results(customers):
    json_path = f"{SAVE_DIR}/ecount_customers_{TIMESTAMP}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(customers, f, ensure_ascii=False, indent=2)
    print(f"\n  → JSON: {json_path}")

    if customers:
        all_keys = []
        for row in customers:
            for k in row.keys():
                if k not in all_keys:
                    all_keys.append(k)
        csv_path = f"{SAVE_DIR}/ecount_customers_{TIMESTAMP}.csv"
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=all_keys)
            w.writeheader()
            for row in customers:
                w.writerow({k: row.get(k, "") for k in all_keys})
        print(f"  → CSV: {csv_path}")

    latest = f"{SAVE_DIR}/ecount_customers_latest.json"
    with open(latest, "w", encoding="utf-8") as f:
        json.dump(customers, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"  이카운트 거래처 크롤링 완료!")
    print(f"  총 {len(customers)}건")
    print(f"  저장: {SAVE_DIR}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
