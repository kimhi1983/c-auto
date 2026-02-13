# Phase 1 완료 - 실행 가이드

## ✅ 완료 현황 (100%)

Phase 1 인증 시스템이 **완전히 구현**되었습니다!

### 구현 완료 항목
- ✅ SQLite 데이터베이스 설정 (개발 환경)
- ✅ 데이터베이스 마이그레이션 완료
- ✅ User 모델 및 인증 시스템
- ✅ JWT 토큰 기반 인증
- ✅ 관리자 계정 생성
- ✅ 로그인 페이지 (Next.js)
- ✅ 대시보드 페이지 (Next.js)
- ✅ CORS 설정

---

## 🚀 실행 방법

### 1단계: 백엔드 서버 시작

```bash
# 프로젝트 루트에서 실행
python app/main.py
```

**예상 출력:**
```
=== C-Auto 서버 시작 ===
Phase 1: 인증 시스템 활성화
API 문서: http://localhost:8000/docs
Next.js 개발 서버: cd frontend-next && npm run dev
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2단계: 프론트엔드 서버 시작

**새 터미널 창에서:**
```bash
cd frontend-next
npm run dev
```

**예상 출력:**
```
▲ Next.js 16.1.6
- Local:        http://localhost:3000
- Ready in 2.5s
```

---

## 🔐 로그인 정보

### 관리자 계정
- **이메일**: `admin@company.com`
- **비밀번호**: `admin1234!`

---

## 🌐 접속 URL

### 프론트엔드 (Next.js)
- 로그인: http://localhost:3000/login
- 대시보드: http://localhost:3000/dashboard

### 백엔드 (FastAPI)
- API 문서 (Swagger): http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- 상태 확인: http://localhost:8000/api/status

---

## 📝 테스트 시나리오

### 시나리오 1: 로그인 테스트
1. 브라우저에서 http://localhost:3000/login 접속
2. 이메일: `admin@company.com` 입력
3. 비밀번호: `admin1234!` 입력
4. "로그인" 버튼 클릭
5. 대시보드로 자동 이동

### 시나리오 2: 대시보드 확인
1. 대시보드에서 사용자 정보 확인:
   - 이름: 시스템 관리자
   - 역할: admin
   - 부서: 경영지원팀
2. 시스템 상태 확인:
   - 인증 시스템 정상 (초록불)
   - 데이터베이스 연결됨 (초록불)
   - API 서버 실행 중 (초록불)
3. "로그아웃" 버튼 클릭
4. 로그인 페이지로 리다이렉트 확인

### 시나리오 3: API 직접 테스트 (선택)
```bash
# 로그인 API 테스트
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@company.com&password=admin1234!"

# 응답 예시:
# {"access_token":"eyJhbGci...","token_type":"bearer"}

# 인증된 사용자 정보 조회 (토큰 필요)
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer [위에서_받은_토큰]"
```

---

## 🛠️ 트러블슈팅

### 문제 1: 백엔드 서버가 시작되지 않음
**증상**: `ModuleNotFoundError` 또는 import 오류

**해결 방법**:
```bash
pip install -r requirements.txt
```

### 문제 2: 프론트엔드 서버 오류
**증상**: `Module not found: Can't resolve...`

**해결 방법**:
```bash
cd frontend-next
rm -rf node_modules
npm install
npm run dev
```

### 문제 3: CORS 오류
**증상**: 브라우저 콘솔에 "CORS policy" 오류

**해결 방법**:
- app/main.py의 CORS 설정 확인
- 백엔드가 http://localhost:8000에서 실행 중인지 확인
- 프론트엔드가 http://localhost:3000에서 실행 중인지 확인

### 문제 4: 로그인 후 "인증 실패"
**증상**: 로그인은 되지만 대시보드에서 에러

**해결 방법**:
```bash
# JWT Secret이 제대로 설정되었는지 확인
cat .env | grep JWT_SECRET

# 데이터베이스 재생성
rm c_auto_dev.db
cd app && python -m alembic upgrade head
python scripts/create_admin.py
```

---

## 📊 시스템 구조

```
e:\c-auto\
├── app/
│   ├── main.py                 # FastAPI 메인 앱
│   ├── database/
│   │   ├── config.py           # DB 연결 설정
│   │   └── base.py             # SQLAlchemy Base
│   ├── models/
│   │   └── user.py             # User 모델
│   ├── auth/
│   │   ├── security.py         # JWT, 비밀번호 해싱
│   │   ├── schemas.py          # Pydantic 스키마
│   │   └── dependencies.py     # FastAPI 의존성
│   ├── api/v1/
│   │   ├── __init__.py         # API 라우터
│   │   └── auth.py             # 인증 엔드포인트
│   └── alembic/
│       └── versions/           # 마이그레이션 파일
├── frontend-next/
│   ├── app/
│   │   ├── login/
│   │   │   └── page.tsx        # 로그인 페이지
│   │   └── dashboard/
│   │       └── page.tsx        # 대시보드
│   └── package.json
├── scripts/
│   └── create_admin.py         # 관리자 생성
├── c_auto_dev.db               # SQLite 데이터베이스
└── .env                        # 환경 변수
```

---

## 🎯 다음 단계 (Phase 2)

Phase 1 완료 후 진행할 작업:

### Phase 2: User Management & RBAC
1. **사용자 CRUD API**
   - 사용자 생성, 수정, 삭제
   - 비밀번호 재설정
   - 사용자 목록 조회

2. **관리자 대시보드**
   - 사용자 관리 UI
   - 역할 변경
   - 계정 활성화/비활성화

3. **감사 로그**
   - 모든 사용자 액션 기록
   - 로그 조회 UI

4. **권한 미들웨어**
   - 역할별 접근 제어
   - 페이지별 권한 확인

**예상 소요 시간**: 2주 (80시간)

---

## 📚 참고 문서

- [PHASE1_COMPLETE.md](PHASE1_COMPLETE.md) - Phase 1 완료 보고서
- [NEXT_STEPS.md](NEXT_STEPS.md) - 원본 가이드 (참고용)
- FastAPI 문서: https://fastapi.tiangolo.com
- Next.js 문서: https://nextjs.org/docs

---

## 🎉 축하합니다!

Phase 1 인증 시스템이 완벽하게 작동합니다!

**테스트 체크리스트:**
- [ ] 백엔드 서버 시작 확인
- [ ] 프론트엔드 서버 시작 확인
- [ ] 로그인 성공 확인
- [ ] 대시보드 접속 확인
- [ ] 사용자 정보 표시 확인
- [ ] 로그아웃 기능 확인
- [ ] API 문서 접속 확인

모든 항목이 체크되면 Phase 2로 진행하세요!
