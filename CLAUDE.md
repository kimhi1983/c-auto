# C-Auto 개발 에이전트 팀 워크플로우

## 프로젝트 개요
KPROS 업무 자동화 플랫폼. 이메일 AI 분석, 파일 관리, 재고 추적, ERP 연동을 수행한다.

## 기술 스택
- **Backend**: Python 3.14 + FastAPI + SQLAlchemy 2.0 + Alembic
- **Frontend**: Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 3.4
- **AI**: Anthropic Claude (정밀분석), Google Gemini 2.0 Flash (빠른분류)
- **Infra**: Cloudflare Workers/D1/Pages, Dropbox API, Ecount ERP

## 핵심 디렉토리 구조
```
app/                          # Python FastAPI 백엔드
├── agents/                   # 업무자동화 에이전트 (오케스트레이터 패턴)
├── api/v1/                   # REST API 라우트 (8개 모듈)
├── core/ai_selector.py       # Claude/Gemini AI 호출 헬퍼
├── models/                   # SQLAlchemy ORM 모델 (7개)
├── modules/                  # 비즈니스 로직 모듈
├── database/                 # DB 설정
├── auth/                     # JWT 인증
├── utils/                    # 로깅, 응답 스키마
└── main.py                   # FastAPI 진입점 (490줄)

frontend-next/                # Next.js 프론트엔드
├── app/
│   ├── login/page.tsx        # 로그인 페이지
│   └── (dashboard)/          # 대시보드 라우트 그룹
│       ├── layout.tsx        # 사이드바+네비게이션 레이아웃
│       ├── dashboard/        # 메인 대시보드
│       ├── emails/           # 이메일 관리
│       ├── users/            # 사용자 관리
│       ├── files/            # 파일 검색
│       ├── ai-docs/          # AI 문서 생성
│       ├── archives/         # 보고서 아카이브
│       ├── inventory/        # 재고 분석
│       ├── erp/              # ERP 연동
│       └── market-report/    # 시장 보고서
└── lib/api.ts                # API 클라이언트 유틸

workers-api/                  # Cloudflare Workers API (TypeScript)
```

---

## 에이전트 팀 구성

모든 개발 작업은 아래 5개 에이전트 역할에 따라 순차적으로 처리한다.

### 1. PM 에이전트 (기획)
**역할**: 요구사항 분석, 영향 범위 파악, 구현 계획 수립

**수행 절차**:
- 사용자 요청을 분석하여 작업 유형 분류 (신규기능 / 수정 / 버그수정 / 리팩토링)
- 관련 파일을 탐색하여 영향 범위 확인
- 변경할 파일 목록과 수정 방향을 TodoWrite로 정리
- 복잡한 작업이면 EnterPlanMode로 계획 승인 요청

**판단 기준**:
- 3개 이상 파일 수정 → 반드시 계획 수립
- API + 프론트엔드 동시 변경 → 반드시 계획 수립
- 단순 수정 1~2줄 → 즉시 실행 가능

### 2. 백엔드 에이전트 (서버 구현)
**역할**: Python/FastAPI 코드 작성, API 엔드포인트, DB 모델, 비즈니스 로직

**코딩 규칙**:
- 새 API 라우트는 `app/api/v1/` 아래에 생성, `app/api/v1/__init__.py`에 라우터 등록
- AI 호출은 반드시 `app/core/ai_selector.py`의 `ask_claude`, `ask_gemini` 사용
- 모델은 `app/models/`에 정의, Alembic 마이그레이션 필요시 생성
- 로깅은 `app/utils/logger.py`의 `setup_logger` 사용
- 응답 스키마는 `app/utils/response_models.py`에 정의
- 에이전트 추가 시 `app/agents/base.py`의 `BaseAgent` 상속
- 환경변수는 `os.getenv()` 사용, 새 변수는 `.env.example`에 추가

### 3. 프론트엔드 에이전트 (웹페이지 수정)
**역할**: Next.js/React 페이지 수정, UI 컴포넌트 구현, 스타일링

**코딩 규칙**:
- 모든 페이지는 `'use client'` 클라이언트 컴포넌트
- 인라인 컴포넌트 패턴 사용 (페이지 파일 내에 컴포넌트 정의)
- API 호출은 `lib/api.ts`의 `apiUrl()`, `authHeaders()`, `authJsonHeaders()` 사용
- Tailwind CSS만 사용 (커스텀 CSS 금지, globals.css의 유틸리티만 예외)
- 컬러 시스템: brand(스카이블루), slate(텍스트/배경), 상태색(blue/orange/green/red)
- 폰트: Pretendard (font-pretendard)
- 인풋: `rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm`
- 카드: `bg-white rounded-2xl border border-slate-200/80 shadow-card`
- 버튼: `rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors`
- 로딩: Skeleton 컴포넌트 또는 스피너 사용
- 모달: `fixed inset-0 bg-black/50 z-50` 오버레이 패턴
- 반응형: mobile-first (sm → md → lg 브레이크포인트)
- 토큰: `localStorage.getItem('access_token')` 인증 패턴
- 새 페이지 추가 시 `(dashboard)/layout.tsx` 네비게이션에 항목 추가

### 4. QA 에이전트 (오류감시)
**역할**: 코드 검증, 에러 체크, 빌드 테스트

**수행 절차**:
- 코드 작성 후 문법 오류 검사
- import 경로 검증 (존재하지 않는 모듈 참조 확인)
- TypeScript 타입 오류 확인 (프론트엔드)
- API 엔드포인트 일관성 확인 (백엔드 라우트 ↔ 프론트엔드 호출)
- 보안 취약점 체크 (인젝션, XSS, 하드코딩된 시크릿)
- 필요시 빌드 명령 실행으로 검증:
  - 프론트엔드: `cd frontend-next && npm run build`
  - 백엔드: `python -c "from app.main import app"`

### 5. DevOps 에이전트 (배포/인프라)
**역할**: 빌드, 배포, Cloudflare Workers 관리

**수행 절차**:
- Cloudflare Workers 변경: `workers-api/` 수정 후 `wrangler deploy`
- 프론트엔드 배포: `cd frontend-next && npm run build` → Cloudflare Pages
- DB 마이그레이션: `alembic revision --autogenerate -m "message"` → `alembic upgrade head`
- 배포 전 반드시 사용자 확인 요청

---

## 작업 파이프라인

모든 개발 요청은 다음 순서로 처리한다:

```
[사용자 요청]
     ↓
[PM 에이전트] → 분석 → 계획 수립 → TodoWrite 작성
     ↓
[백엔드 에이전트] ←→ [프론트엔드 에이전트]  (병렬 가능)
     ↓
[QA 에이전트] → 코드 검증 → 빌드 테스트
     ↓
[DevOps 에이전트] → 배포 (요청 시에만)
     ↓
[완료 보고]
```

**병렬 처리 규칙**:
- 백엔드와 프론트엔드가 독립적이면 Task 도구로 병렬 실행
- API 변경이 프론트에 영향을 주면 백엔드 먼저 → 프론트엔드 순서
- QA는 항상 구현 완료 후 실행

---

## 커밋 메시지 규칙
```
feat: 새 기능 추가
fix: 버그 수정
refactor: 리팩토링
style: UI/스타일 변경
docs: 문서 수정
chore: 설정/빌드 변경
```
한글 설명 사용. 예: `feat: 이메일 자동분류 기능 추가`

## 주의사항
- `.env` 파일은 절대 커밋하지 않는다
- 사용자 확인 없이 `git push`, `wrangler deploy` 실행 금지
- AI API 키는 환경변수로만 관리
- 프론트엔드는 static export 모드 (`output: 'export'`)
- 한국어 UI 유지 (코드 주석도 한국어 가능)
