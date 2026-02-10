# 업무 자동화 통합 시스템 (C-Auto)

이 프로젝트는 재고 관리, 이메일 대응, 사내 커뮤니케이션 기록을 자동화하여 업무 효율을 극대화하는 웹 기반 플랫폼입니다. GitHub와 Cloudflare를 활용해 회사와 집, 어디서든 끊김 없는 협업 환경을 구축합니다.

## 🛠 시스템 아키텍처 및 스택

- **Language**: Python (FastAPI 또는 Flask)
- **Database**: Local Excel (기록용) & Cloudflare D1 (공유 데이터용)
- **LLM Interface**: Claude Code / Gemini API (이메일 분석 및 답신 생성)
- **Infra**: GitHub (코드 관리), Cloudflare Pages/Workers (호스팅)
- **Automation**: Python pandas (엑셀), imaplib (메일), pyautogui/selenium (오픈채팅 기록)

## 📋 핵심 모듈 상세 (Phase 1)

### 1. 재고 관리 모듈
- 입/출고 데이터 기록 및 실시간 재고 현황 파악
- 모든 데이터는 로컬 엑셀과 연동되며, 클라우드 동기화를 통해 다중 기기 지원

### 2. 스마트 이메일 핸들러
- **분류**: 수신 메일을 AI(Gemini)가 분석하여 일반 문의 / 발주 / 긴급 등으로 분류
- **자동 대응**: 메일 내용에 필요한 자료를 로컬 드라이브에서 검색 후 자동 첨부 및 답신 초안 작성
- **기록**: 발신/수신 내역 전문 엑셀 저장

### 3. 발주 및 작업 지시 관리
- 메일 및 메시지에서 발주 내용을 추출하여 작업 지시서로 변환
- 업무 우선순위에 따른 대시보드 업데이트

### 4. 오픈채팅 모음이
- 내부 카카오톡/오픈채팅 내용을 텍스트로 추출하여 엑셀에 타임라인별 기록
- 주요 키워드 알림 기능 포함

## 🔄 다중 기기 공동 작업 설정 (집 & 회사)

이사님께서 두 대 이상의 컴퓨터를 사용하시므로 아래와 같은 워크플로우를 권장합니다.

- **코드 동기화**: GitHub 저장소를 통해 모든 소스코드를 관리합니다. (회사에서 Push → 집에서 Pull)
- **데이터 동기화**: 
  - 엑셀 파일: OneDrive/Google Drive 등 클라우드 폴더를 로컬 드라이브 경로로 사용
  - 공유 DB: Cloudflare D1을 사용하여 기기 간 설정값이나 실시간 상태값 공유
- **환경 변수**: `.env` 파일을 활용해 각 기기별 로컬 경로(자료 저장소 등)를 개별 설정합니다.

## 🛣 로드맵 (업데이트 예정)

### Phase 1: 기반 구축 (현재)
- [x] 프로젝트 구조 설정 및 GitHub Repository 연동
- [ ] 엑셀 입출력 기본 모듈 개발
- [ ] Cloudflare 호스팅 환경 설정

### Phase 2: AI 및 자동화 고도화
- [ ] Gemini/Claude API 연동 (이메일 분석 자동화)
- [ ] 로컬 파일 검색 시스템 엔진 구축
- [ ] 오픈채팅 로그 크롤러 개발

### Phase 3: 프론트엔드/백엔드 확장
- [ ] 사용자 UI(Dashboard) 웹 페이지 제작
- [ ] 실시간 재고 알림 봇 연동
- [ ] 다중 접속 보안 인증 시스템 적용

## 📁 프로젝트 구조

```
c-auto/
├── app/                # 백엔드 및 주요 로직 (FastAPI/Python)
│   ├── main.py         # 프로그램 실행 메인 파일
│   ├── api/            # API 엔드포인트 (백엔드 확장용)
│   ├── core/           # 공통 설정 (Gemini/Claude API 연결 등)
│   ├── modules/        # 핵심 기능 단위
│   │   ├── inventory.py    # 재고 관리 로직
│   │   ├── email_bot.py    # 이메일 분류 및 자동 답신
│   │   ├── chat_logger.py  # 오픈채팅 기록 로직
│   │   └── file_search.py  # 로컬 드라이브 검색
│   └── utils/          # 엑셀 저장 및 공통 도구
├── frontend/           # 프론트엔드 (향후 React/Next.js 등 확장용)
├── data/               # (로컬 전용) 엑셀 및 결과물 저장 폴더
├── tests/              # 테스트 코드
├── .env                # API 키, 로컬 경로 등 환경 변수
├── .gitignore          # 깃허브 제외 파일 설정
├── README.md           # 프로젝트 기획서
└── requirements.txt    # 설치 필요한 라이브러리 목록
```

## 🚀 시작하기

### 1. 환경 설정

```bash
# 가상환경 생성 (선택사항)
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Mac/Linux

# 패키지 설치
pip install -r requirements.txt
```

### 2. 환경 변수 설정

`.env` 파일을 열어 본인의 API 키와 로컬 경로를 설정하세요.

### 3. 실행

```bash
cd app
python main.py
```

## 📝 라이선스

이 프로젝트는 개인 프로젝트입니다.
