"""
C-Auto v2.0 사용설명서 PDF 생성 스크립트
"""
from fpdf import FPDF
import os
from datetime import datetime


class ManualPDF(FPDF):
    """C-Auto 사용설명서 PDF 클래스"""

    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=25)

        # 맑은 고딕 폰트 등록
        font_path = "C:/Windows/Fonts/"
        self.add_font("malgun", "", os.path.join(font_path, "malgun.ttf"))
        self.add_font("malgun", "B", os.path.join(font_path, "malgunbd.ttf"))

        self.current_chapter = 0

    def header(self):
        if self.page_no() > 1:
            self.set_font("malgun", "B", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, "C-Auto v2.0 사용설명서", align="L")
            self.cell(0, 8, f"- {self.page_no()} -", align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(200, 200, 200)
            self.line(10, 18, 200, 18)
            self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("malgun", "", 7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, "Copyright 2025 C-Auto. All rights reserved.", align="C")

    def cover_page(self):
        """표지 페이지"""
        self.add_page()
        self.ln(50)

        # 타이틀
        self.set_font("malgun", "B", 32)
        self.set_text_color(30, 41, 59)  # slate-800
        self.cell(0, 20, "C-Auto v2.0", align="C", new_x="LMARGIN", new_y="NEXT")

        self.ln(5)
        self.set_font("malgun", "B", 20)
        self.set_text_color(14, 165, 233)  # sky-500
        self.cell(0, 15, "Smart Business Management System", align="C", new_x="LMARGIN", new_y="NEXT")

        self.ln(10)
        self.set_draw_color(14, 165, 233)
        self.set_line_width(0.8)
        self.line(60, self.get_y(), 150, self.get_y())

        self.ln(15)
        self.set_font("malgun", "B", 24)
        self.set_text_color(30, 41, 59)
        self.cell(0, 15, "사 용 설 명 서", align="C", new_x="LMARGIN", new_y="NEXT")

        self.ln(40)
        self.set_font("malgun", "", 12)
        self.set_text_color(100, 116, 139)  # slate-500
        today = datetime.now().strftime("%Y년 %m월")
        self.cell(0, 8, f"버전: 2.0", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 8, f"작성일: {today}", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 8, "문서 분류: 내부용", align="C", new_x="LMARGIN", new_y="NEXT")

    def toc_page(self):
        """목차 페이지"""
        self.add_page()
        self.set_font("malgun", "B", 20)
        self.set_text_color(30, 41, 59)
        self.cell(0, 15, "목  차", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(10)

        toc_items = [
            ("1.", "시스템 개요", "3"),
            ("  1.1", "C-Auto 소개", "3"),
            ("  1.2", "주요 기능 요약", "3"),
            ("  1.3", "시스템 접속 방법", "4"),
            ("2.", "로그인", "5"),
            ("  2.1", "로그인 방법", "5"),
            ("  2.2", "아이디 기억하기", "5"),
            ("  2.3", "사용자 권한 안내", "5"),
            ("3.", "대시보드", "6"),
            ("  3.1", "대시보드 화면 구성", "6"),
            ("  3.2", "요약 카드 (통계)", "6"),
            ("  3.3", "환율 위젯", "7"),
            ("  3.4", "최근 활동 내역", "7"),
            ("4.", "이메일 관리", "8"),
            ("  4.1", "이메일 목록 조회", "8"),
            ("  4.2", "이메일 수신 (불러오기)", "8"),
            ("  4.3", "AI 자동 분류 (8분류)", "9"),
            ("  4.4", "이메일 상세 보기", "9"),
            ("  4.5", "AI 답신 생성", "10"),
            ("  4.6", "결재 워크플로우", "10"),
            ("5.", "AI 서류 작성", "11"),
            ("  5.1", "서류 작성 (7종 템플릿)", "11"),
            ("  5.2", "서류 분석 (4종 모드)", "12"),
            ("  5.3", "문서 수정/개선", "13"),
            ("  5.4", "문서 히스토리", "13"),
            ("6.", "파일 검색", "14"),
            ("  6.1", "키워드 검색", "14"),
            ("  6.2", "검색 결과 활용", "14"),
            ("  6.3", "AI 파일 추천", "14"),
            ("7.", "문서 보관함 (아카이브)", "15"),
            ("  7.1", "아카이브 목록", "15"),
            ("  7.2", "문서 생성 및 저장", "15"),
            ("  7.3", "검색 및 다운로드", "15"),
            ("8.", "재고 관리", "16"),
            ("  8.1", "재고 현황 조회", "16"),
            ("  8.2", "입고/출고 처리", "16"),
            ("  8.3", "재고 부족 알림", "17"),
            ("9.", "사용자 관리 (관리자)", "18"),
            ("  9.1", "사용자 목록", "18"),
            ("  9.2", "사용자 추가/수정", "18"),
            ("  9.3", "권한 설정", "18"),
            ("10.", "자주 묻는 질문 (FAQ)", "19"),
        ]

        self.set_font("malgun", "", 11)
        for num, title, page in toc_items:
            if num.strip().endswith("."):
                self.set_font("malgun", "B", 11)
                self.set_text_color(30, 41, 59)
            else:
                self.set_font("malgun", "", 10)
                self.set_text_color(71, 85, 105)

            dots = "." * (55 - len(num) - len(title))
            self.cell(0, 7, f"{num}  {title}  {dots}  {page}", new_x="LMARGIN", new_y="NEXT")

    def chapter_title(self, num, title):
        """장 제목"""
        self.current_chapter = num
        self.ln(5)

        # 배경 박스
        y_before = self.get_y()
        self.set_fill_color(240, 249, 255)  # sky-50
        self.rect(10, y_before, 190, 14, "F")

        self.set_draw_color(14, 165, 233)
        self.set_line_width(0.6)
        self.line(10, y_before, 10, y_before + 14)

        self.set_font("malgun", "B", 16)
        self.set_text_color(14, 165, 233)
        self.set_xy(15, y_before + 1)
        self.cell(0, 12, f"{num}.  {title}")
        self.set_y(y_before + 18)

    def section_title(self, num, title):
        """절 제목"""
        self.ln(3)
        self.set_font("malgun", "B", 13)
        self.set_text_color(30, 41, 59)
        self.cell(0, 10, f"{num}  {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def sub_section_title(self, title):
        """소절 제목"""
        self.ln(2)
        self.set_font("malgun", "B", 11)
        self.set_text_color(51, 65, 85)
        self.cell(0, 8, f"  {title}", new_x="LMARGIN", new_y="NEXT")

    def body_text(self, text):
        """본문 텍스트"""
        self.set_font("malgun", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(10)
        self.multi_cell(190, 6, text)
        self.ln(2)

    def bullet_item(self, text, indent=10):
        """불릿 항목"""
        self.set_font("malgun", "", 10)
        self.set_text_color(51, 65, 85)
        self.cell(indent, 6, "")
        self.cell(5, 6, "-")
        self.multi_cell(170, 6, text)

    def numbered_step(self, num, text):
        """번호 단계"""
        self.set_font("malgun", "B", 10)
        self.set_text_color(14, 165, 233)
        self.cell(15, 6, f"  {num}.")
        self.set_font("malgun", "", 10)
        self.set_text_color(51, 65, 85)
        self.multi_cell(170, 6, text)

    def info_box(self, title, text):
        """정보 박스"""
        self.ln(2)
        y_start = self.get_y()

        # 텍스트 높이 미리 계산
        self.set_font("malgun", "", 9)
        lines = self.multi_cell(170, 5, text, dry_run=True, output="LINES")
        box_height = 10 + len(lines) * 5 + 6

        # 페이지 넘침 체크
        if y_start + box_height > 270:
            self.add_page()
            y_start = self.get_y()

        self.set_fill_color(255, 251, 235)  # amber-50
        self.rect(15, y_start, 180, box_height, "F")
        self.set_draw_color(245, 158, 11)  # amber-500
        self.set_line_width(0.4)
        self.line(15, y_start, 15, y_start + box_height)

        self.set_xy(20, y_start + 3)
        self.set_font("malgun", "B", 9)
        self.set_text_color(180, 83, 9)
        self.cell(0, 5, title)

        self.set_xy(20, y_start + 10)
        self.set_font("malgun", "", 9)
        self.set_text_color(120, 53, 15)
        self.multi_cell(170, 5, text)

        self.set_y(y_start + box_height + 3)

    def tip_box(self, text):
        """팁 박스"""
        self.ln(2)
        y_start = self.get_y()

        self.set_font("malgun", "", 9)
        lines = self.multi_cell(170, 5, text, dry_run=True, output="LINES")
        box_height = 8 + len(lines) * 5 + 4

        if y_start + box_height > 270:
            self.add_page()
            y_start = self.get_y()

        self.set_fill_color(236, 253, 245)  # emerald-50
        self.rect(15, y_start, 180, box_height, "F")
        self.set_draw_color(16, 185, 129)
        self.set_line_width(0.4)
        self.line(15, y_start, 15, y_start + box_height)

        self.set_xy(20, y_start + 3)
        self.set_font("malgun", "B", 9)
        self.set_text_color(6, 95, 70)
        self.cell(5, 5, "TIP:")
        self.set_font("malgun", "", 9)
        self.set_text_color(6, 95, 70)
        self.multi_cell(165, 5, f" {text}")

        self.set_y(y_start + box_height + 3)

    def table_header(self, cols, widths):
        """테이블 헤더"""
        self.set_font("malgun", "B", 9)
        self.set_fill_color(241, 245, 249)
        self.set_text_color(30, 41, 59)
        self.set_draw_color(203, 213, 225)
        for i, col in enumerate(cols):
            self.cell(widths[i], 8, col, border=1, fill=True, align="C")
        self.ln()

    def table_row(self, cols, widths, align=None):
        """테이블 행"""
        self.set_font("malgun", "", 9)
        self.set_text_color(51, 65, 85)
        self.set_draw_color(226, 232, 240)
        for i, col in enumerate(cols):
            a = align[i] if align else "L"
            self.cell(widths[i], 7, col, border=1, align=a)
        self.ln()


def generate_manual():
    pdf = ManualPDF()

    # ============================
    # 표지
    # ============================
    pdf.cover_page()

    # ============================
    # 목차
    # ============================
    pdf.toc_page()

    # ============================
    # 1. 시스템 개요
    # ============================
    pdf.add_page()
    pdf.chapter_title(1, "시스템 개요")

    pdf.section_title("1.1", "C-Auto 소개")
    pdf.body_text(
        "C-Auto는 기업 업무 효율화를 위한 통합 비즈니스 관리 시스템입니다. "
        "AI 기반 이메일 분석, 문서 자동 작성, 파일 검색, 재고 관리, 환율 조회 등 "
        "다양한 업무 기능을 하나의 웹 플랫폼에서 제공합니다.\n\n"
        "주요 AI 엔진:\n"
        "  - Claude (Anthropic): 고품질 문서 작성, 답신 생성, 분석\n"
        "  - Gemini (Google): 빠른 이메일 분류, 키워드 추출"
    )

    pdf.section_title("1.2", "주요 기능 요약")

    widths = [30, 70, 90]
    pdf.table_header(["메뉴", "기능", "설명"], widths)
    rows = [
        ["대시보드", "업무 현황 요약", "통계 카드, 환율 위젯, 최근 활동"],
        ["이메일", "이메일 관리", "수신, AI 8분류, 답신 생성, 결재"],
        ["AI 서류", "AI 문서 작성/분석", "7종 작성, 4종 분석, 문서 수정"],
        ["파일 검색", "Dropbox 파일 검색", "키워드 검색, AI 파일 추천"],
        ["보관함", "문서 아카이브", "자동 보관, 검색, 다운로드"],
        ["재고", "재고 관리", "현황 조회, 입출고, 부족 알림"],
        ["사용자", "사용자 관리", "계정 관리, 권한 설정 (관리자)"],
    ]
    aligns = ["C", "L", "L"]
    for row in rows:
        pdf.table_row(row, widths, aligns)

    pdf.ln(5)
    pdf.section_title("1.3", "시스템 접속 방법")
    pdf.body_text("웹 브라우저에서 아래 주소로 접속합니다:")
    pdf.body_text("    주소:  https://c-auto.kimhi1983.com")
    pdf.body_text(
        "권장 브라우저: Chrome, Edge, Firefox (최신 버전)\n"
        "모바일 브라우저도 지원됩니다 (반응형 디자인)."
    )

    # ============================
    # 2. 로그인
    # ============================
    pdf.add_page()
    pdf.chapter_title(2, "로그인")

    pdf.section_title("2.1", "로그인 방법")
    pdf.numbered_step(1, "웹 브라우저에서 C-Auto 주소에 접속합니다.")
    pdf.numbered_step(2, "로그인 화면이 나타나면 이메일 주소와 비밀번호를 입력합니다.")
    pdf.numbered_step(3, "'로그인' 버튼을 클릭합니다.")
    pdf.numbered_step(4, "인증이 완료되면 대시보드 화면으로 이동합니다.")
    pdf.ln(3)

    pdf.info_box("참고",
        "초기 관리자 계정은 시스템 설치 시 생성됩니다. "
        "일반 사용자 계정은 관리자가 '사용자 관리' 메뉴에서 생성해 줍니다.")

    pdf.section_title("2.2", "아이디 기억하기")
    pdf.body_text(
        "로그인 화면에서 '아이디 기억하기' 체크박스를 선택하면, "
        "다음 접속 시 이메일 주소가 자동으로 입력됩니다. "
        "공용 PC에서는 사용하지 않는 것을 권장합니다."
    )

    pdf.section_title("2.3", "사용자 권한 안내")
    pdf.body_text("C-Auto는 4단계 사용자 권한을 지원합니다:")
    pdf.ln(2)

    widths = [30, 50, 110]
    pdf.table_header(["권한", "역할", "접근 가능 기능"], widths)
    pdf.table_row(["Admin", "최고 관리자", "모든 기능 + 사용자 관리 + 시스템 설정"], widths, ["C", "C", "L"])
    pdf.table_row(["Approver", "결재자/팀장", "모든 기능 + 이메일 결재 승인/반려"], widths, ["C", "C", "L"])
    pdf.table_row(["Staff", "일반 직원", "이메일, AI서류, 파일검색, 재고 관리"], widths, ["C", "C", "L"])
    pdf.table_row(["Viewer", "열람자", "대시보드, 이메일 열람 (수정 불가)"], widths, ["C", "C", "L"])

    # ============================
    # 3. 대시보드
    # ============================
    pdf.add_page()
    pdf.chapter_title(3, "대시보드")

    pdf.section_title("3.1", "대시보드 화면 구성")
    pdf.body_text(
        "로그인 후 가장 먼저 보이는 화면입니다. "
        "업무 현황을 한눈에 파악할 수 있는 요약 정보를 제공합니다."
    )
    pdf.body_text(
        "화면 구성:\n"
        "  - 상단: 네비게이션 바 (사용자 이름, 로그아웃)\n"
        "  - 좌측: 사이드바 메뉴 (7개 메뉴 + 환율 위젯)\n"
        "  - 중앙: 메인 콘텐츠 영역"
    )

    pdf.section_title("3.2", "요약 카드 (통계)")
    pdf.body_text("대시보드 상단에 4개의 통계 카드가 표시됩니다:")
    pdf.ln(2)

    widths = [45, 70, 75]
    pdf.table_header(["카드", "표시 정보", "설명"], widths)
    pdf.table_row(["오늘의 이메일", "수신된 이메일 수", "오늘 처리해야 할 이메일 건수"], widths)
    pdf.table_row(["미처리 건수", "미완료 이메일 수", "아직 처리/결재되지 않은 건수"], widths)
    pdf.table_row(["재고 알림", "부족 품목 수", "최소 재고 이하인 품목 수"], widths)
    pdf.table_row(["보관 문서", "아카이브 총 건수", "저장된 문서 총 건수"], widths)

    pdf.section_title("3.3", "환율 위젯")
    pdf.body_text(
        "사이드바 하단에 실시간 환율 정보가 표시됩니다:\n\n"
        "  - USD/KRW: 미국 달러 환율\n"
        "  - CNY/KRW: 중국 위안 환율\n"
        "  - 전일 대비 변동률 (상승/하락 표시)\n"
        "  - 환율 데이터는 매일 자동 업데이트됩니다."
    )

    pdf.section_title("3.4", "최근 활동 내역")
    pdf.body_text(
        "대시보드 하단에는 최근 업무 활동 내역이 시간순으로 표시됩니다. "
        "이메일 수신, 결재 처리, 문서 생성 등 주요 활동을 확인할 수 있습니다."
    )

    # ============================
    # 4. 이메일 관리
    # ============================
    pdf.add_page()
    pdf.chapter_title(4, "이메일 관리")

    pdf.section_title("4.1", "이메일 목록 조회")
    pdf.body_text(
        "좌측 사이드바에서 '이메일' 메뉴를 클릭하면 이메일 관리 화면으로 이동합니다.\n\n"
        "이메일 목록에서 확인 가능한 정보:\n"
        "  - 발신자 이름 및 이메일 주소\n"
        "  - 이메일 제목\n"
        "  - AI 분류 카테고리 (색상 뱃지)\n"
        "  - 우선순위 (긴급/보통/낮음)\n"
        "  - 수신 일시\n"
        "  - 처리 상태 (미처리/처리중/완료)"
    )

    pdf.section_title("4.2", "이메일 수신 (불러오기)")
    pdf.numbered_step(1, "이메일 화면 상단의 '이메일 불러오기' 버튼을 클릭합니다.")
    pdf.numbered_step(2, "시스템이 하이웍스 메일 서버에서 새 이메일을 가져옵니다.")
    pdf.numbered_step(3, "가져온 이메일은 AI가 자동으로 분류합니다.")
    pdf.numbered_step(4, "분류가 완료되면 목록에 새 이메일이 나타납니다.")
    pdf.ln(3)

    pdf.tip_box("이메일 불러오기는 POP3 프로토콜을 사용합니다. 서버 설정은 관리자에게 문의하세요.")

    pdf.section_title("4.3", "AI 자동 분류 (8분류)")
    pdf.body_text("수신된 이메일은 Gemini AI가 자동으로 8개 카테고리로 분류합니다:")
    pdf.ln(2)

    widths = [25, 55, 110]
    pdf.table_header(["분류", "카테고리", "설명"], widths)
    pdf.table_row(["1", "발주 (Order)", "제품/서비스 발주 관련 이메일"], widths, ["C", "L", "L"])
    pdf.table_row(["2", "요청 (Request)", "업무 요청, 자료 요청 등"], widths, ["C", "L", "L"])
    pdf.table_row(["3", "견적요청 (Quote)", "가격 견적 요청/제출 관련"], widths, ["C", "L", "L"])
    pdf.table_row(["4", "문의 (Inquiry)", "제품/서비스 관련 문의"], widths, ["C", "L", "L"])
    pdf.table_row(["5", "공지 (Notice)", "사내/외 공지사항"], widths, ["C", "L", "L"])
    pdf.table_row(["6", "미팅 (Meeting)", "회의/미팅 일정 관련"], widths, ["C", "L", "L"])
    pdf.table_row(["7", "클레임 (Claim)", "불만, 클레임, 문제 보고"], widths, ["C", "L", "L"])
    pdf.table_row(["8", "기타 (Other)", "위 7개에 해당하지 않는 이메일"], widths, ["C", "L", "L"])

    pdf.ln(3)
    pdf.section_title("4.4", "이메일 상세 보기")
    pdf.body_text(
        "이메일 목록에서 원하는 이메일을 클릭하면 상세 화면이 열립니다.\n\n"
        "상세 화면 구성:\n"
        "  - 이메일 원문 (발신자, 수신자, 제목, 본문)\n"
        "  - AI 분석 결과 (카테고리, 우선순위, 요약)\n"
        "  - AI 추천 답신 초안\n"
        "  - 첨부파일 목록\n"
        "  - 결재 상태 및 이력"
    )

    pdf.add_page()
    pdf.section_title("4.5", "AI 답신 생성")
    pdf.body_text(
        "이메일 상세 화면에서 'AI 답신 생성' 버튼을 클릭하면 "
        "Claude AI가 비즈니스 한국어로 전문적인 답신 초안을 작성합니다."
    )
    pdf.numbered_step(1, "이메일 상세 화면에서 'AI 답신 생성' 버튼을 클릭합니다.")
    pdf.numbered_step(2, "AI가 이메일 내용을 분석하고 적절한 답신을 생성합니다 (약 3-5초).")
    pdf.numbered_step(3, "생성된 답신을 검토하고 필요한 부분을 직접 수정합니다.")
    pdf.numbered_step(4, "수정 완료 후 '결재 요청' 버튼으로 승인 프로세스를 시작합니다.")
    pdf.ln(3)

    pdf.info_box("AI 답신 참고사항",
        "AI가 생성한 답신은 반드시 검토 후 사용하세요. 금액, 날짜, 약속사항 등 "
        "중요한 내용은 직접 확인 후 수정이 필요합니다.")

    pdf.section_title("4.6", "결재 워크플로우")
    pdf.body_text(
        "이메일 답신은 결재 프로세스를 통해 발송됩니다:\n"
    )
    pdf.ln(2)

    widths = [25, 35, 60, 70]
    pdf.table_header(["단계", "상태", "담당자", "설명"], widths)
    pdf.table_row(["1", "작성", "담당자 (Staff)", "답신 초안 작성 및 수정"], widths, ["C", "C", "L", "L"])
    pdf.table_row(["2", "검토", "담당자 (Staff)", "내용 확인 후 결재 요청"], widths, ["C", "C", "L", "L"])
    pdf.table_row(["3", "승인", "결재자 (Approver)", "내용 승인 또는 반려"], widths, ["C", "C", "L", "L"])
    pdf.table_row(["4", "발송", "시스템 (자동)", "승인 완료 시 자동 발송"], widths, ["C", "C", "L", "L"])

    pdf.ln(3)
    pdf.body_text(
        "결재가 반려된 경우:\n"
        "  - 반려 사유가 담당자에게 전달됩니다.\n"
        "  - 담당자가 수정 후 다시 결재를 요청할 수 있습니다."
    )

    # ============================
    # 5. AI 서류 작성
    # ============================
    pdf.add_page()
    pdf.chapter_title(5, "AI 서류 작성")

    pdf.body_text(
        "AI 서류 작성 기능은 Claude AI를 활용하여 각종 비즈니스 문서를 "
        "자동으로 작성하고 분석하는 기능입니다. 3개의 탭으로 구성됩니다."
    )

    pdf.section_title("5.1", "서류 작성 (7종 템플릿)")
    pdf.body_text("메모나 핵심 정보만 입력하면 AI가 공식 문서 형태로 완성합니다.")
    pdf.ln(2)

    widths = [35, 60, 95]
    pdf.table_header(["템플릿", "용도", "입력 내용 예시"], widths)
    pdf.table_row(["업무지시서", "업무 지시/배분", "업무 내용, 담당자, 기한, 특이사항"], widths)
    pdf.table_row(["업무보고서", "업무 결과 보고", "기간, 수행 업무, 성과, 다음 계획"], widths)
    pdf.table_row(["회의록", "회의 내용 기록", "일시, 참석자, 안건, 논의 내용, 결정사항"], widths)
    pdf.table_row(["견적서", "가격 견적 제출", "품목, 수량, 단가, 조건, 유효기간"], widths)
    pdf.table_row(["비즈니스 서신", "공식 서신 발송", "수신자, 목적, 주요 내용"], widths)
    pdf.table_row(["계약서 검토", "계약 조항 분석", "계약서 전문 또는 주요 조항"], widths)
    pdf.table_row(["이메일 분석", "수신 이메일 분석", "이메일 본문 (자동 연동 가능)"], widths)

    pdf.ln(3)
    pdf.sub_section_title("사용 방법")
    pdf.numbered_step(1, "좌측 사이드바에서 'AI 서류' 메뉴를 클릭합니다.")
    pdf.numbered_step(2, "'서류 작성' 탭을 선택합니다.")
    pdf.numbered_step(3, "원하는 문서 템플릿 카드를 클릭합니다.")
    pdf.numbered_step(4, "텍스트 입력란에 핵심 내용이나 메모를 입력합니다.")
    pdf.numbered_step(5, "'문서 생성' 버튼을 클릭합니다.")
    pdf.numbered_step(6, "AI가 공식 문서 형태로 작성합니다 (약 5-10초).")
    pdf.numbered_step(7, "결과를 확인하고 복사하거나, 수정 모드로 전환할 수 있습니다.")

    pdf.ln(3)
    pdf.tip_box(
        "입력 내용이 상세할수록 더 정확한 문서가 생성됩니다. "
        "날짜, 금액, 이름 등 구체적인 정보를 포함하면 수정이 최소화됩니다."
    )

    pdf.add_page()
    pdf.section_title("5.2", "서류 분석 (4종 모드)")
    pdf.body_text(
        "기존 문서를 붙여넣으면 AI가 다양한 관점에서 분석해 줍니다."
    )
    pdf.ln(2)

    widths = [30, 60, 100]
    pdf.table_header(["분석 모드", "분석 내용", "활용 예시"], widths)
    pdf.table_row(["종합 분석", "의도, 맥락, 대응방안 3가지", "수신 이메일의 의도 파악 및 대응 전략"], widths)
    pdf.table_row(["계약 분석", "조항별 리스크 분석", "계약서 조항의 법률적 리스크 검토"], widths)
    pdf.table_row(["재무 분석", "금액, 환율, 결제조건", "거래의 재무적 영향도 및 리스크 파악"], widths)
    pdf.table_row(["리스크 분석", "위험요소, 대응방안", "프로젝트/거래의 전반적 리스크 평가"], widths)

    pdf.ln(3)
    pdf.sub_section_title("사용 방법")
    pdf.numbered_step(1, "'서류 분석' 탭을 선택합니다.")
    pdf.numbered_step(2, "분석 모드 (종합/계약/재무/리스크)를 선택합니다.")
    pdf.numbered_step(3, "분석할 문서 내용을 텍스트 입력란에 붙여넣습니다.")
    pdf.numbered_step(4, "'분석 시작' 버튼을 클릭합니다.")
    pdf.numbered_step(5, "AI가 선택한 관점에서 상세 분석 결과를 제공합니다.")

    pdf.section_title("5.3", "문서 수정/개선")
    pdf.body_text(
        "기존 문서를 AI에게 지시하여 수정/개선할 수 있습니다.\n\n"
        "사용 방법:\n"
    )
    pdf.numbered_step(1, "'문서 수정' 탭을 선택합니다.")
    pdf.numbered_step(2, "원본 문서를 상단 입력란에 붙여넣습니다.")
    pdf.numbered_step(3, "수정 지시사항을 하단 입력란에 입력합니다.")
    pdf.numbered_step(4, "'수정 실행' 버튼을 클릭합니다.")

    pdf.ln(3)
    pdf.body_text(
        "수정 지시사항 예시:\n"
        '  - "더 격식있는 톤으로 변경해 주세요"\n'
        '  - "핵심 내용을 표로 정리해 주세요"\n'
        '  - "영문으로 번역해 주세요"\n'
        '  - "요약을 3줄로 줄여 주세요"'
    )

    pdf.section_title("5.4", "문서 히스토리")
    pdf.body_text(
        "AI로 생성/분석한 모든 문서는 자동으로 저장됩니다. "
        "화면 우측의 '문서 히스토리' 사이드바에서 이전에 생성한 "
        "문서들을 확인하고 다시 열어볼 수 있습니다."
    )

    # ============================
    # 6. 파일 검색
    # ============================
    pdf.add_page()
    pdf.chapter_title(6, "파일 검색")

    pdf.section_title("6.1", "키워드 검색")
    pdf.body_text(
        "Dropbox에 저장된 파일을 키워드로 검색할 수 있습니다.\n"
    )
    pdf.numbered_step(1, "좌측 사이드바에서 '파일 검색' 메뉴를 클릭합니다.")
    pdf.numbered_step(2, "검색창에 찾고자 하는 파일명 또는 키워드를 입력합니다.")
    pdf.numbered_step(3, "'검색' 버튼을 클릭하거나 Enter 키를 누릅니다.")
    pdf.numbered_step(4, "검색 결과가 파일명, 경로, 크기, 수정일과 함께 표시됩니다.")

    pdf.ln(3)
    pdf.body_text(
        "검색 범위:\n"
        "  - Dropbox 내 모든 파일 (설정된 제외 폴더 제외)\n"
        "  - 파일명, 폴더명 기준 검색\n"
        "  - 대소문자 구분 없음"
    )

    pdf.section_title("6.2", "검색 결과 활용")
    pdf.body_text(
        "검색 결과에서 파일을 선택하면:\n"
        "  - 파일 경로 복사 가능\n"
        "  - AI 업무폴더로 파일 복사 가능\n"
        "  - 파일 미리보기 (이미지, PDF 등)"
    )

    pdf.section_title("6.3", "AI 파일 추천")
    pdf.body_text(
        "이메일과 연관된 파일을 AI가 자동으로 추천합니다. "
        "이메일 상세 화면에서 'AI 파일 추천' 기능을 사용하면 "
        "이메일 내용에 맞는 관련 파일을 찾아줍니다.\n\n"
        "추천 기준:\n"
        "  - 이메일에 언급된 회사명, 제품명\n"
        "  - 이메일 카테고리와 관련된 파일 유형\n"
        "  - 최근 작업한 관련 파일"
    )

    # ============================
    # 7. 문서 보관함
    # ============================
    pdf.add_page()
    pdf.chapter_title(7, "문서 보관함 (아카이브)")

    pdf.section_title("7.1", "아카이브 목록")
    pdf.body_text(
        "좌측 사이드바에서 '보관함' 메뉴를 클릭하면 "
        "저장된 모든 문서를 확인할 수 있습니다.\n\n"
        "표시 정보:\n"
        "  - 문서명\n"
        "  - 문서 유형 (PDF, Excel, 이메일 등)\n"
        "  - 회사명\n"
        "  - 보관일\n"
        "  - 생성자"
    )

    pdf.section_title("7.2", "문서 생성 및 저장")
    pdf.body_text(
        "아카이브 문서는 다음과 같은 경우에 자동으로 생성됩니다:\n"
        "  - 이메일 처리 완료 시 (이메일 원문 + AI 분석 결과)\n"
        "  - AI 서류 작성 시 (생성된 문서 자동 저장)\n"
        "  - 수동으로 '아카이브 저장' 버튼 클릭 시\n\n"
        "폴더 구조:\n"
        "  archives / YYYY / MM / 카테고리 / 회사명 /"
    )

    pdf.section_title("7.3", "검색 및 다운로드")
    pdf.body_text(
        "보관함에서 검색 및 다운로드:\n"
    )
    pdf.numbered_step(1, "상단 검색창에서 문서명 또는 회사명으로 검색합니다.")
    pdf.numbered_step(2, "유형 필터 (PDF/Excel/이메일)로 문서를 필터링합니다.")
    pdf.numbered_step(3, "원하는 문서의 '다운로드' 버튼을 클릭합니다.")

    # ============================
    # 8. 재고 관리
    # ============================
    pdf.add_page()
    pdf.chapter_title(8, "재고 관리")

    pdf.section_title("8.1", "재고 현황 조회")
    pdf.body_text(
        "좌측 사이드바에서 '재고' 메뉴를 클릭하면 재고 관리 화면으로 이동합니다.\n\n"
        "재고 목록에서 확인 가능한 정보:\n"
        "  - 품목 코드\n"
        "  - 품목명\n"
        "  - 현재 재고 수량\n"
        "  - 최소 재고 기준\n"
        "  - 단가\n"
        "  - 공급처\n"
        "  - 마지막 업데이트 일시"
    )

    pdf.ln(2)
    pdf.info_box("재고 부족 표시",
        "현재 재고가 최소 재고 기준 이하인 품목은 빨간색으로 강조 표시되며, "
        "대시보드의 재고 알림 카드에도 반영됩니다.")

    pdf.section_title("8.2", "입고/출고 처리")

    pdf.sub_section_title("입고 처리")
    pdf.numbered_step(1, "재고 목록에서 해당 품목을 찾습니다.")
    pdf.numbered_step(2, "'입고' 버튼을 클릭합니다.")
    pdf.numbered_step(3, "입고 수량과 참조 번호(선택)를 입력합니다.")
    pdf.numbered_step(4, "메모가 있으면 입력합니다.")
    pdf.numbered_step(5, "'확인' 버튼을 클릭하면 재고가 증가합니다.")

    pdf.ln(3)
    pdf.sub_section_title("출고 처리")
    pdf.numbered_step(1, "재고 목록에서 해당 품목을 찾습니다.")
    pdf.numbered_step(2, "'출고' 버튼을 클릭합니다.")
    pdf.numbered_step(3, "출고 수량과 참조 번호(선택)를 입력합니다.")
    pdf.numbered_step(4, "'확인' 버튼을 클릭하면 재고가 감소합니다.")

    pdf.ln(3)
    pdf.tip_box(
        "모든 입출고 내역은 거래 이력으로 자동 기록됩니다. "
        "품목별 거래 이력은 품목 상세 화면에서 확인할 수 있습니다."
    )

    pdf.section_title("8.3", "재고 부족 알림")
    pdf.body_text(
        "재고 수량이 설정된 최소 기준 이하로 떨어지면:\n"
        "  - 해당 품목이 빨간색으로 강조됩니다.\n"
        "  - 대시보드 재고 알림 카드에 숫자가 증가합니다.\n"
        "  - 관리자에게 알림이 전송됩니다.\n\n"
        "최소 재고 기준은 관리자가 품목 설정에서 변경할 수 있습니다."
    )

    # ============================
    # 9. 사용자 관리
    # ============================
    pdf.add_page()
    pdf.chapter_title(9, "사용자 관리 (관리자 전용)")

    pdf.info_box("권한 안내",
        "이 메뉴는 Admin 권한을 가진 관리자만 접근할 수 있습니다. "
        "일반 사용자에게는 사이드바에 표시되지 않습니다.")

    pdf.section_title("9.1", "사용자 목록")
    pdf.body_text(
        "좌측 사이드바에서 '사용자' 메뉴를 클릭하면 "
        "전체 사용자 목록을 확인할 수 있습니다.\n\n"
        "표시 정보:\n"
        "  - 이름\n"
        "  - 이메일\n"
        "  - 부서\n"
        "  - 권한 (Admin/Approver/Staff/Viewer)\n"
        "  - 활성 상태\n"
        "  - 가입일"
    )

    pdf.section_title("9.2", "사용자 추가/수정")

    pdf.sub_section_title("사용자 추가")
    pdf.numbered_step(1, "'새 사용자 추가' 버튼을 클릭합니다.")
    pdf.numbered_step(2, "필수 정보를 입력합니다: 이름, 이메일, 초기 비밀번호, 부서.")
    pdf.numbered_step(3, "사용자 권한을 선택합니다 (Admin/Approver/Staff/Viewer).")
    pdf.numbered_step(4, "'저장' 버튼을 클릭합니다.")

    pdf.ln(3)
    pdf.sub_section_title("사용자 수정")
    pdf.numbered_step(1, "사용자 목록에서 수정할 사용자를 클릭합니다.")
    pdf.numbered_step(2, "변경할 정보를 수정합니다.")
    pdf.numbered_step(3, "'저장' 버튼을 클릭합니다.")

    pdf.ln(3)
    pdf.sub_section_title("사용자 비활성화")
    pdf.body_text(
        "퇴사자 등의 계정은 삭제 대신 비활성화 처리합니다. "
        "비활성화된 사용자는 로그인이 불가능하며, 기존 활동 이력은 보존됩니다."
    )

    pdf.section_title("9.3", "권한 설정")
    pdf.body_text(
        "각 권한별 접근 가능 기능:\n"
    )

    widths = [30, 28, 28, 28, 28, 28, 20]
    pdf.set_font("malgun", "B", 8)
    pdf.set_fill_color(241, 245, 249)
    pdf.set_text_color(30, 41, 59)
    pdf.set_draw_color(203, 213, 225)
    cols = ["기능", "대시보드", "이메일", "AI서류", "파일", "재고", "관리"]
    for i, col in enumerate(cols):
        pdf.cell(widths[i], 7, col, border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_font("malgun", "", 8)
    pdf.set_text_color(51, 65, 85)
    rows = [
        ["Admin", "O", "O", "O", "O", "O", "O"],
        ["Approver", "O", "O", "O", "O", "O", "X"],
        ["Staff", "O", "O", "O", "O", "O", "X"],
        ["Viewer", "O", "읽기만", "X", "읽기만", "읽기만", "X"],
    ]
    for row in rows:
        for i, col in enumerate(row):
            pdf.cell(widths[i], 7, col, border=1, align="C")
        pdf.ln()

    # ============================
    # 10. FAQ
    # ============================
    pdf.add_page()
    pdf.chapter_title(10, "자주 묻는 질문 (FAQ)")

    faq_items = [
        ("Q1. 비밀번호를 잊어버렸습니다. 어떻게 해야 하나요?",
         "관리자에게 연락하여 비밀번호 초기화를 요청하세요. 관리자가 임시 비밀번호를 설정해 주면, 로그인 후 프로필에서 비밀번호를 변경하실 수 있습니다."),

        ("Q2. AI가 생성한 문서의 내용이 정확하지 않습니다.",
         "AI 생성 문서는 참고 자료로 활용하시고, 반드시 담당자가 검토 후 사용해 주세요. 특히 금액, 날짜, 약속사항 등 중요한 내용은 직접 확인이 필요합니다. 입력 내용을 더 상세하게 작성하면 정확도가 높아집니다."),

        ("Q3. 이메일 불러오기가 되지 않습니다.",
         "메일 서버 연결 상태를 확인해 주세요. 하이웍스 서버 점검 시간이거나, 네트워크 문제일 수 있습니다. 문제가 지속되면 관리자에게 문의해 주세요."),

        ("Q4. 이메일 AI 분류가 정확하지 않습니다.",
         "AI 분류 정확도는 약 90% 이상이나, 일부 모호한 이메일은 오분류될 수 있습니다. 이 경우 이메일 상세 화면에서 직접 카테고리를 수정할 수 있습니다."),

        ("Q5. 파일 검색에서 원하는 파일이 나오지 않습니다.",
         "다른 키워드로 다시 검색해 보세요. 파일명의 일부만 입력해도 검색이 가능합니다. 파일 인덱싱은 매일 자동 업데이트되므로, 최근 추가된 파일은 다음 날부터 검색 가능합니다."),

        ("Q6. AI 서류 작성 시 '생성 실패' 오류가 발생합니다.",
         "AI API 서버의 일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요. 입력 텍스트가 너무 긴 경우에도 오류가 발생할 수 있으므로, 핵심 내용 위주로 간결하게 입력해 보세요."),

        ("Q7. 재고 수량이 실제와 다릅니다.",
         "입출고 처리가 누락된 건이 없는지 거래 이력을 확인해 주세요. 실사 결과와 차이가 있는 경우, 관리자에게 재고 조정을 요청하세요."),

        ("Q8. 모바일에서도 사용할 수 있나요?",
         "네, C-Auto는 반응형 디자인을 지원합니다. 스마트폰이나 태블릿의 웹 브라우저에서 동일한 주소로 접속하면 모바일에 최적화된 화면으로 이용하실 수 있습니다."),

        ("Q9. 환율 정보가 업데이트되지 않습니다.",
         "환율 데이터는 매일 자동으로 업데이트됩니다. 공휴일이나 주말에는 직전 영업일 환율이 표시됩니다. 수동 업데이트가 필요한 경우 관리자에게 문의하세요."),

        ("Q10. 로그인 세션이 자주 만료됩니다.",
         "보안을 위해 24시간(1440분) 후 자동 로그아웃됩니다. 장시간 사용 시 다시 로그인해 주세요."),
    ]

    for q, a in faq_items:
        # 페이지 넘김 체크
        if pdf.get_y() > 240:
            pdf.add_page()

        pdf.set_font("malgun", "B", 10)
        pdf.set_text_color(14, 165, 233)
        pdf.set_x(10)
        pdf.multi_cell(190, 6, q)
        pdf.set_font("malgun", "", 10)
        pdf.set_text_color(51, 65, 85)
        pdf.set_x(10)
        pdf.multi_cell(190, 6, a)
        pdf.ln(4)

    # ============================
    # 마지막 페이지 - 연락처
    # ============================
    if pdf.get_y() > 220:
        pdf.add_page()

    pdf.ln(10)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)

    pdf.set_font("malgun", "B", 12)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 8, "기술 지원 및 문의", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("malgun", "", 10)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 6, "시스템 관련 문의사항은 관리자에게 연락해 주세요.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "C-Auto v2.0  |  Smart Business Management System", align="C", new_x="LMARGIN", new_y="NEXT")

    # ============================
    # PDF 저장
    # ============================
    output_path = "e:/c-auto/C-Auto_사용설명서_v2.0.pdf"
    pdf.output(output_path)
    print(f"PDF 생성 완료: {output_path}")
    print(f"총 페이지 수: {pdf.page}")
    return output_path


if __name__ == "__main__":
    generate_manual()
