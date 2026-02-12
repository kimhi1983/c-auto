# Phase 1 다음 단계 가이드

## 📍 현재 상태

✅ **완료된 작업**:
- Next.js 프론트엔드 프로젝트 설정
- PostgreSQL + SQLAlchemy 백엔드 구조
- JWT 인증 시스템 구현
- User 모델 및 API 엔드포인트
- main.py 업데이트 (API v1 라우터 통합)
- 문서화 완료

⏳ **남은 작업**:
- PostgreSQL 데이터베이스 설정
- 초기 마이그레이션 실행
- 관리자 계정 생성
- 로그인 페이지 구현
- 대시보드 레이아웃 구현

---

## 🗄️ Step 1: PostgreSQL 데이터베이스 설정

### 옵션 A: 로컬 PostgreSQL 설치 (개발 환경)

#### Windows
1. **PostgreSQL 다운로드 및 설치**
   ```
   https://www.postgresql.org/download/windows/
   ```
   - 권장 버전: PostgreSQL 15 or 16
   - 설치 시 비밀번호 설정: `postgres`

2. **데이터베이스 생성**
   ```bash
   # PostgreSQL 설치 후 명령 프롬프트에서:
   psql -U postgres

   # psql 프롬프트에서:
   CREATE DATABASE c_auto_dev;
   \q
   ```

3. **.env 파일 확인**
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/c_auto_dev
   ```

### 옵션 B: Docker로 PostgreSQL 실행 (추천)

```bash
# PostgreSQL 컨테이너 시작
docker run --name c-auto-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=c_auto_dev \
  -p 5432:5432 \
  -d postgres:15

# 확인
docker ps
```

### 옵션 C: 클라우드 PostgreSQL (Render/Supabase)

#### Render PostgreSQL
1. Render 대시보드 → New PostgreSQL
2. 무료 플랜 선택
3. 생성된 DATABASE_URL 복사
4. `.env` 파일 업데이트

#### Supabase
1. https://supabase.com 가입
2. New Project 생성
3. Settings → Database → Connection string 복사
4. `.env` 파일 업데이트

---

## 🔄 Step 2: 데이터베이스 마이그레이션 실행

### 2.1 초기 마이그레이션 생성

```bash
cd app
python -m alembic revision --autogenerate -m "Create users table"
```

**출력 예시**:
```
Generating E:\c-auto\app\alembic\versions\xxxxx_create_users_table.py ... done
```

### 2.2 마이그레이션 적용

```bash
cd app
python -m alembic upgrade head
```

**출력 예시**:
```
INFO  [alembic.runtime.migration] Running upgrade  -> xxxxx, Create users table
```

### 2.3 마이그레이션 확인

```bash
cd app
python -m alembic current
```

---

## 👤 Step 3: 관리자 계정 생성

### 3.1 Python 스크립트로 생성

**파일 생성**: `scripts/create_admin.py`

```python
"""
관리자 계정 생성 스크립트
"""
import sys
sys.path.insert(0, ".")

from app.database.config import SessionLocal
from app.models.user import User, UserRole
from app.auth.security import get_password_hash

def create_admin():
    db = SessionLocal()

    # 관리자 계정 확인
    admin = db.query(User).filter(User.email == "admin@company.com").first()

    if admin:
        print("⚠️  관리자 계정이 이미 존재합니다.")
        return

    # 새 관리자 생성
    admin = User(
        email="admin@company.com",
        password_hash=get_password_hash("admin1234!"),  # 변경 필수!
        full_name="시스템 관리자",
        role=UserRole.ADMIN,
        department="경영지원팀",
        is_active=True
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("✅ 관리자 계정 생성 완료!")
    print(f"   이메일: {admin.email}")
    print(f"   비밀번호: admin1234!")
    print(f"   역할: {admin.role}")
    print("\n⚠️  보안을 위해 첫 로그인 후 비밀번호를 변경하세요!")

    db.close()

if __name__ == "__main__":
    create_admin()
```

### 3.2 실행

```bash
python scripts/create_admin.py
```

---

## 🚀 Step 4: 백엔드 서버 실행 및 테스트

### 4.1 서버 시작

```bash
# 기존 방식
python app/main.py

# 또는 uvicorn 직접 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4.2 API 문서 확인

브라우저에서 열기:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 4.3 로그인 테스트 (Postman/curl)

#### 로그인 요청
```bash
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@company.com&password=admin1234!"
```

#### 응답
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer"
}
```

#### 인증된 요청 테스트
```bash
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer eyJhbGci..."
```

#### 응답
```json
{
  "id": 1,
  "email": "admin@company.com",
  "full_name": "시스템 관리자",
  "role": "admin",
  "department": "경영지원팀",
  "is_active": true
}
```

---

## 🎨 Step 5: 프론트엔드 로그인 페이지 구현

### 5.1 로그인 페이지 생성

**파일**: `frontend-next/app/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error('로그인 실패');
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);

      router.push('/dashboard');
    } catch (err) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-brand-50 to-slate-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">C-Auto</h1>
          <p className="text-slate-600">스마트 이메일 분석 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              placeholder="이메일을 입력하세요"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white rounded-full px-8 py-3.5 font-semibold hover:shadow-[0_0_20px_rgba(15,23,42,0.4)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

### 5.2 대시보드 페이지 생성

**파일**: `frontend-next/app/dashboard/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  department: string;
  is_active: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('access_token');

      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch('http://localhost:8000/api/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('인증 실패');
        }

        const data = await response.json();
        setUser(data);
      } catch (err) {
        localStorage.removeItem('access_token');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-600">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">C-Auto</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <div className="font-semibold text-slate-900">{user?.full_name}</div>
              <div className="text-slate-600">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            대시보드
          </h2>
          <p className="text-slate-600">
            Phase 1: 인증 시스템이 성공적으로 작동 중입니다! 🎉
          </p>
        </div>
      </main>
    </div>
  );
}
```

### 5.3 Next.js 개발 서버 실행

```bash
cd frontend-next
npm run dev
```

브라우저에서 확인:
- http://localhost:3000/login
- 로그인 후 http://localhost:3000/dashboard

---

## ✅ Phase 1 완료 체크리스트

- [x] Git 브랜치 생성 (`feature/redesign`)
- [x] Next.js 프론트엔드 설정
- [x] PostgreSQL 백엔드 구조
- [x] User 모델 생성
- [x] JWT 인증 시스템
- [x] API 엔드포인트
- [x] main.py 통합
- [x] 문서화
- [ ] PostgreSQL 데이터베이스 설정
- [ ] 초기 마이그레이션
- [ ] 관리자 계정 생성
- [ ] 로그인 페이지
- [ ] 대시보드 페이지
- [ ] E2E 테스트

---

## 🎯 다음 작업 (진행 순서)

1. **PostgreSQL 설정** (Option A, B, or C 선택)
2. **마이그레이션 실행** (`alembic upgrade head`)
3. **관리자 계정 생성** (`scripts/create_admin.py`)
4. **백엔드 테스트** (curl/Postman)
5. **로그인 페이지 구현** (`frontend-next/app/login/page.tsx`)
6. **대시보드 페이지 구현** (`frontend-next/app/dashboard/page.tsx`)
7. **통합 테스트** (전체 플로우)
8. **커밋 & Phase 2 준비**

---

## 💡 추가 참고사항

### 개발 환경 추천 구성
```
Terminal 1: FastAPI 백엔드
cd e:\c-auto
python app/main.py

Terminal 2: Next.js 프론트엔드
cd e:\c-auto\frontend-next
npm run dev

Terminal 3: PostgreSQL (Docker)
docker start c-auto-postgres
```

### 트러블슈팅

**문제**: PostgreSQL 연결 실패
```
해결: DATABASE_URL 확인, PostgreSQL 서비스 시작
```

**문제**: JWT 토큰 만료
```
해결: 재로그인 또는 JWT_EXPIRE_MINUTES 값 조정
```

**문제**: CORS 오류
```
해결: main.py의 allow_origins에 localhost:3000 추가
```

---

**준비 완료!** 위 단계를 따라 Phase 1을 완성하세요! 🚀
