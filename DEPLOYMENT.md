# C-Auto 배포 가이드

## 🚀 배포 방법

### 방법 1: Railway (백엔드) + Cloudflare Pages (프론트엔드)

#### Step 1: Railway에 백엔드 배포

1. **Railway 계정 생성**
   - https://railway.app/ 접속
   - GitHub 계정으로 로그인

2. **새 프로젝트 생성**
   - "New Project" 클릭
   - "Deploy from GitHub repo" 선택
   - `kimhi1983/c-auto` 저장소 선택

3. **환경 변수 설정**
   Railway Dashboard에서 다음 환경 변수 추가:
   ```
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   EMAIL_USER=your_email
   EMAIL_PASS=your_password
   IMAP_SERVER=pop.hiworks.com
   IMAP_PORT=995
   DROPBOX_PATH=/app/data
   EXCLUDE_FOLDER=회사 자료
   AI_WORK_DIR=AI 업무폴더
   ```

4. **배포 완료**
   - 자동으로 배포 시작
   - 배포 완료 후 URL 확인 (예: `https://c-auto-production.up.railway.app`)

#### Step 2: Cloudflare Pages에 프론트엔드 배포

1. **Cloudflare Dashboard 접속**
   - https://dash.cloudflare.com/
   - Pages 메뉴 선택

2. **새 프로젝트 생성**
   - "Create a project" 클릭
   - GitHub 연결
   - `kimhi1983/c-auto` 저장소 선택

3. **빌드 설정**
   ```
   Build command: (없음)
   Build output directory: frontend
   Root directory: /
   ```

4. **환경 변수 설정**
   ```
   API_URL=https://your-railway-url.up.railway.app
   ```

5. **배포 완료**
   - 자동 배포 시작
   - URL 확인 (예: `https://c-auto.pages.dev`)

#### Step 3: 커스텀 도메인 연결

1. **Cloudflare Pages에서**
   - "Custom domains" 탭
   - "Set up a domain" 클릭
   - 본인의 도메인 입력 (예: `c-auto.yourdomain.com`)
   - DNS 자동 설정

2. **완료!**
   - 본인 도메인으로 접속: `https://c-auto.yourdomain.com`

---

### 방법 2: Render (전체 배포)

#### Step 1: Render에 배포

1. **Render 계정 생성**
   - https://render.com/ 접속
   - GitHub 계정으로 로그인

2. **새 Web Service 생성**
   - "New +" → "Web Service"
   - GitHub 저장소 연결: `kimhi1983/c-auto`

3. **설정**
   ```
   Name: c-auto
   Environment: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

4. **환경 변수 설정**
   위의 Railway와 동일한 환경 변수 추가

5. **배포 완료**
   - URL 확인 (예: `https://c-auto.onrender.com`)

#### Step 2: Cloudflare 도메인 연결

1. **Cloudflare DNS 설정**
   - DNS 메뉴 접속
   - CNAME 레코드 추가:
     ```
     Type: CNAME
     Name: c-auto (또는 원하는 서브도메인)
     Target: your-app.onrender.com
     Proxy: ON (주황색 구름)
     ```

2. **완료!**
   - 본인 도메인으로 접속: `https://c-auto.yourdomain.com`

---

## 🔒 보안 체크리스트

배포 전 확인사항:

- [x] `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- [x] 환경 변수를 플랫폼에 직접 설정
- [x] API 키가 코드에 하드코딩되지 않았는지 확인
- [x] CORS 설정이 올바른지 확인

---

## 📊 비용

- **Railway**: 월 $5 (500시간 무료)
- **Render**: 무료 플랜 가능 (sleep 모드 있음)
- **Cloudflare Pages**: 완전 무료

---

## 🆘 문제 해결

### 배포 실패 시

1. **로그 확인**: 각 플랫폼의 로그 확인
2. **환경 변수**: 모든 필수 환경 변수가 설정되었는지 확인
3. **Python 버전**: Python 3.11 권장

### 도메인 연결 안 될 시

1. **DNS 전파 대기**: 최대 24시간 소요
2. **Cloudflare SSL/TLS**: Full 모드 설정
3. **Proxy 상태**: 주황색 구름 활성화

---

## 🎉 완료!

배포가 완료되면:
- ✅ 본인 도메인으로 접속 가능
- ✅ HTTPS 자동 적용
- ✅ 전세계 어디서나 접속 가능
