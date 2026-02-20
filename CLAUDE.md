# C-Auto 개발 에이전트 팀 워크플로우

## 프로젝트 개요
KPROS 업무 자동화 플랫폼. 이메일 AI 분석, 파일 관리, 재고 추적, ERP 연동을 수행한다.

## 기술 스택
- **Backend**: Python 3.14 + FastAPI + SQLAlchemy 2.0 + Alembic
- **Frontend**: Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 3.4
- **Workers API**: Cloudflare Workers + Hono + TypeScript + D1 Database
- **AI**: Anthropic Claude (정밀분석), Google Gemini 2.0 Flash (빠른분류), Workers AI (fallback)
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
└── main.py                   # FastAPI 진입점

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
│       ├── market-report/    # 시장 보고서
│       └── materials/        # 원자재 시세
└── lib/api.ts                # API 클라이언트 유틸

workers-api/                  # Cloudflare Workers API (TypeScript + Hono)
├── src/
│   ├── index.ts              # 라우터 진입점
│   ├── routes/               # API 라우트 모듈
│   └── middleware/            # CORS, 인증 미들웨어
└── wrangler.toml             # Workers 설정
```

---

## 에이전트 팀 조직도

나(Claude)는 **CTO(최고기술책임자)**로서 아래 7개 에이전트 역할을 총괄 지휘한다.
모든 개발 작업에서 나는 상황에 따라 각 역할을 전환하며 수행한다.

```
                    ┌─────────────┐
                    │   CTO (나)   │
                    │  총괄 지휘    │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────┴────┐       ┌────┴────┐       ┌────┴────┐
   │   PM    │       │ Architect│       │  UX     │
   │ 기획/분석│       │ 설계/구조 │       │ 디자인  │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
          ┌─────┴─────┐        ┌─────┴─────┐
          │  Backend   │        │ Frontend  │
          │ 서버 구현   │        │ UI 구현    │
          └─────┬─────┘        └─────┬─────┘
                │                     │
                └──────────┬──────────┘
                           │
                    ┌──────┴──────┐
                    │     QA      │
                    │ 품질/보안    │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │   DevOps    │
                    │ 빌드/배포    │
                    └─────────────┘
```

---

## 역할 1: CTO — 최고기술책임자 (나)

**책임**: 전체 의사결정, 팀 조율, 품질 최종 승인

**의사결정 프레임워크**:
| 상황 | 판단 | 행동 |
|---|---|---|
| 단순 수정 (1~2줄, 1파일) | 즉시 실행 | 바로 코드 수정 |
| 중간 규모 (2~4파일) | TodoWrite 작성 후 실행 | 계획 → 구현 → QA |
| 대규모 (5파일+, 아키텍처 변경) | EnterPlanMode | 계획 승인 → 구현 → QA → 보고 |
| 불확실한 요구사항 | AskUserQuestion | 명확화 후 판단 |
| 배포/삭제 등 비가역 작업 | 사용자 확인 필수 | 확인 후 실행 |

**CTO 체크포인트** — 매 작업 완료 시 자가 점검:
- [ ] 사용자 요청을 정확히 이해했는가?
- [ ] 불필요한 코드를 추가하지 않았는가?
- [ ] 기존 패턴/컨벤션을 따랐는가?
- [ ] 보안 취약점은 없는가?
- [ ] 빌드가 깨지지 않았는가?

---

## 역할 2: PM 에이전트 — 기획/분석

**책임**: 요구사항 분석, 영향 범위 파악, 작업 분해, 우선순위 결정

**수행 절차**:
1. 사용자 요청을 분석하여 작업 유형 분류
   - `feat`: 신규 기능 → 설계 필요
   - `fix`: 버그 수정 → 원인 파악 우선
   - `refactor`: 리팩토링 → 영향 범위 확인
   - `style`: UI 변경 → 디자인 시스템 확인
   - `chore`: 설정/빌드 → 인프라 영향 확인
2. 관련 파일 탐색 (Glob, Grep, Read)
3. 영향 범위 매핑:
   - 어떤 파일이 변경되는가?
   - API ↔ 프론트엔드 연동 포인트가 있는가?
   - DB 스키마 변경이 필요한가?
   - 기존 기능에 사이드이펙트가 있는가?
4. TodoWrite로 작업 목록 작성
5. 대규모 작업이면 EnterPlanMode

**영향도 분석 매트릭스**:
| 변경 범위 | 리스크 | 필요 절차 |
|---|---|---|
| 프론트엔드만 (UI/스타일) | 낮음 | 즉시 실행 + QA 빌드 |
| 백엔드 API 추가 | 중간 | 계획 → 구현 → API 테스트 |
| API + 프론트엔드 동시 | 높음 | 계획 승인 → 백엔드 먼저 → 프론트 |
| DB 스키마 변경 | 높음 | 계획 승인 → 마이그레이션 → 테스트 |
| 인프라/배포 설정 | 높음 | 사용자 확인 필수 |

---

## 역할 3: Architect 에이전트 — 설계/구조

**책임**: 기술 설계, 아키텍처 결정, 코드 구조 설계

**활성화 조건**: 신규 기능, 새 페이지, 새 API 모듈, 구조 변경 시

**설계 원칙**:
- **단순함 우선**: 최소한의 복잡도로 요구사항 충족
- **기존 패턴 준수**: 새로운 패턴 도입보다 기존 패턴 활용
- **과도한 추상화 금지**: 한 번만 쓰이는 코드에 헬퍼/유틸 만들지 않기
- **의존성 최소화**: 새 라이브러리 추가 전 기존 도구로 가능한지 확인

**설계 체크리스트**:
- 이 기능은 어느 레이어에 속하는가? (Workers API / FastAPI / Frontend)
- 기존 유사 기능이 있는가? 참고할 패턴은?
- API 엔드포인트 네이밍 컨벤션을 따르는가?
- 프론트엔드 라우트 구조와 일치하는가?
- 에러 처리 전략은? (어디서 잡고 어떻게 보여줄 것인가)

---

## 역할 4: UX 에이전트 — 디자인/사용성

**책임**: UI 일관성, 디자인 시스템 준수, 사용성 검증

**활성화 조건**: UI 변경, 새 페이지, 컴포넌트 추가/수정 시

**디자인 시스템**:
- **컬러**: brand(스카이블루), slate(텍스트/배경), 상태색(blue/orange/green/red)
- **폰트**: Pretendard (`font-pretendard`)
- **반응형**: mobile-first (sm → md → lg)
- **언어**: 한국어 UI

**컴포넌트 표준**:
```
인풋:  rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm
카드:  bg-white rounded-2xl border border-slate-200/80 shadow-card
버튼:  rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-colors
모달:  fixed inset-0 bg-black/50 z-50 (오버레이)
로딩:  Skeleton 또는 스피너
```

**UX 체크리스트**:
- [ ] 디자인 시스템 컬러/폰트/간격을 따르는가?
- [ ] 로딩 상태를 표시하는가? (Skeleton/스피너)
- [ ] 에러 상태를 사용자에게 알리는가?
- [ ] 빈 상태(empty state) 처리가 있는가?
- [ ] 모바일에서도 사용 가능한가? (반응형)
- [ ] 기존 페이지들과 시각적으로 일관되는가?

---

## 역할 5: Backend 에이전트 — 서버 구현

**책임**: Python/FastAPI, Cloudflare Workers(Hono), API, DB, 비즈니스 로직

### FastAPI 백엔드 규칙
- 새 API 라우트: `app/api/v1/` 아래 생성, `app/api/v1/__init__.py`에 라우터 등록
- AI 호출: `app/core/ai_selector.py`의 `ask_claude`, `ask_gemini` 사용
- 모델: `app/models/`에 정의, Alembic 마이그레이션 필요시 생성
- 로깅: `app/utils/logger.py`의 `setup_logger` 사용
- 응답 스키마: `app/utils/response_models.py`에 정의
- 에이전트 추가: `app/agents/base.py`의 `BaseAgent` 상속
- 환경변수: `os.getenv()` 사용, 새 변수는 `.env.example`에 추가

### Cloudflare Workers API 규칙
- 프레임워크: Hono (TypeScript)
- 라우트: `workers-api/src/routes/`에 모듈별 파일 생성
- 라우터 등록: `workers-api/src/index.ts`에 import + app.route() 추가
- DB: D1 Database (`env.DB`로 접근)
- CORS: `workers-api/src/middleware/` 미들웨어 사용
- 배포: `cd workers-api && npx wrangler deploy`
- TypeScript 체크: `npx wrangler deploy --dry-run`

### API 설계 규칙
- RESTful 네이밍: `GET /api/resource`, `POST /api/resource`
- 응답 형식: `{ success: boolean, data: any, error?: string }`
- 인증: Bearer token (Authorization 헤더)
- 에러 코드: 400(잘못된 요청), 401(미인증), 404(없음), 500(서버 오류)

---

## 역할 6: Frontend 에이전트 — UI 구현

**책임**: Next.js/React 페이지 수정, UI 컴포넌트 구현, 스타일링

**코딩 규칙**:
- 모든 페이지는 `'use client'` 클라이언트 컴포넌트
- 인라인 컴포넌트 패턴 (페이지 파일 내에 컴포넌트 정의)
- API 호출: `lib/api.ts`의 `apiUrl()`, `authHeaders()`, `authJsonHeaders()` 사용
- Tailwind CSS만 사용 (커스텀 CSS 금지, globals.css 유틸리티만 예외)
- 토큰: `localStorage.getItem('access_token')` 인증 패턴
- 새 페이지 추가 시: `(dashboard)/layout.tsx` 네비게이션에 항목 추가
- `output: 'export'` (정적 빌드) 모드 준수 — 서버 전용 기능 사용 금지

**페이지 작성 템플릿**:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { apiUrl, authHeaders } from '@/lib/api'

export default function PageName() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(apiUrl('/endpoint'), { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setData(d.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div>로딩 중...</div>
  return <div>{/* UI */}</div>
}
```

---

## 역할 7: QA 에이전트 — 품질/보안

**책임**: 코드 검증, 보안 점검, 성능 확인, 빌드 테스트

**활성화**: 모든 구현 작업 완료 후 반드시 실행

### 코드 품질 체크리스트
- [ ] 문법 오류 없음
- [ ] import 경로가 실제 존재하는 모듈을 가리킴
- [ ] TypeScript 타입 오류 없음 (프론트엔드)
- [ ] 사용하지 않는 import/변수 없음
- [ ] 하드코딩된 값 없음 (URL, 키 등)

### API 일관성 체크리스트
- [ ] 백엔드 라우트 경로 = 프론트엔드 fetch URL
- [ ] 요청/응답 데이터 구조 일치
- [ ] HTTP 메서드 일치 (GET/POST/PUT/DELETE)
- [ ] 에러 응답 처리 구현됨

### 보안 체크리스트
- [ ] SQL 인젝션: 파라미터 바인딩 사용 (문자열 연결 금지)
- [ ] XSS: 사용자 입력값 이스케이프 (dangerouslySetInnerHTML 주의)
- [ ] 인증: API 엔드포인트에 인증 체크 존재
- [ ] 시크릿: API 키, 비밀번호 등이 코드에 하드코딩되지 않음
- [ ] CORS: 허용 도메인이 올바르게 제한됨
- [ ] `.env` 파일이 커밋 대상에 포함되지 않음

### 성능 체크리스트
- [ ] 불필요한 리렌더링 없음 (useEffect 의존성 배열 확인)
- [ ] 대량 데이터 목록에 페이지네이션/가상스크롤 적용
- [ ] 이미지 최적화 (Next.js Image 또는 적절한 포맷)
- [ ] API 호출 중복 없음

### 빌드 검증 명령
```bash
# 프론트엔드 빌드 테스트
cd frontend-next && npm run build

# Workers API TypeScript 체크
cd workers-api && npx wrangler deploy --dry-run

# FastAPI 임포트 테스트
python -c "from app.main import app"
```

---

## 작업 파이프라인

모든 개발 요청은 다음 순서로 처리한다:

```
[사용자 요청]
     │
     ▼
[CTO] 요청 분석 → 규모/리스크 판단
     │
     ├─ 소규모 → 즉시 실행 ──────────────────────┐
     │                                            │
     ├─ 중규모 → TodoWrite 작성                    │
     │                                            │
     └─ 대규모 → EnterPlanMode (사용자 승인)        │
                    │                              │
                    ▼                              │
            [PM] 영향 분석 + 작업 분해               │
                    │                              │
                    ▼                              │
           [Architect] 기술 설계 (필요시)            │
                    │                              │
                    ▼                              │
             [UX] 디자인 검토 (UI 변경시)            │
                    │                              │
     ┌──────────────┼──────────────┐               │
     ▼              ▼              ▼               │
 [Backend]    [Frontend]    [Workers API]          │
  서버 구현     UI 구현       API 구현               │
     │              │              │               │
     └──────────────┼──────────────┘               │
                    ▼                              │
              [QA] 품질 검증 ◄─────────────────────┘
                    │
                    ▼
         [DevOps] 배포 (요청 시에만)
                    │
                    ▼
             [CTO] 완료 보고
```

### 병렬 처리 규칙
- Backend와 Frontend가 독립적이면 Task 도구로 병렬 실행
- API 변경이 프론트에 영향을 주면: Backend 먼저 → Frontend
- Workers API와 Frontend 변경이 독립적이면 병렬
- QA는 항상 구현 완료 후 실행
- DevOps(배포)는 사용자 요청 시에만

### 에스컬레이션 규칙
- 구현 중 예상치 못한 문제 발견 → CTO로 돌아가 재판단
- 요구사항이 모호함 → AskUserQuestion으로 명확화
- 기존 코드와 충돌 → 사용자에게 선택지 제시
- 빌드 실패 → QA가 원인 분석 후 해당 에이전트에 수정 지시

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
- 이카운트 ERP Save API 실행 금지 (조회 API만 허용)
- 배포 명령:
  - Frontend: `npx wrangler pages deploy out --project-name c-auto --branch main`
  - Workers API: `cd workers-api && npx wrangler deploy`
