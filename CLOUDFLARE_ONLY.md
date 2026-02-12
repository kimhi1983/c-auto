# Cloudflare만으로 C-Auto 배포하기

## 🎯 방법 선택

### 방법 1: Cloudflare Tunnel (영구) ⭐ 권장
- ✅ **완전 무료**
- ✅ **FastAPI 전체 기능**
- ✅ **간단한 설정**
- ⚠️ 서버가 항상 실행되어야 함

### 방법 2: Cloudflare Pages + 무료 백엔드
- ✅ **완전 클라우드**
- ✅ **서버 관리 불필요**
- ✅ **무료 (Render 무료 플랜)**
- ⚠️ 15분 미사용 시 sleep

---

## 🚀 방법 1: Cloudflare Tunnel 영구 설정

### 빠른 시작

#### 1. 자동 설정 스크립트 실행

```bash
# 파일 탐색기에서 실행
setup-cloudflare.bat
```

이 스크립트가 자동으로:
1. ✅ Cloudflare 로그인
2. ✅ 터널 생성
3. ✅ DNS 레코드 추가

#### 2. 터널 시작

```bash
# 영구 터널 시작
start-tunnel-permanent.bat
```

#### 3. 완료!

이제 `https://c-auto.yourdomain.com` 으로 접속 가능!

---

### 수동 설정 (고급)

#### Step 1: Cloudflare 로그인

```bash
cloudflared tunnel login
```

브라우저가 열리고 Cloudflare 계정으로 로그인하세요.

#### Step 2: 터널 생성

```bash
cd e:\c-auto
cloudflared tunnel create c-auto
```

**출력 예시:**
```
Tunnel credentials written to C:\Users\user\.cloudflared\abc123.json
Created tunnel c-auto with id abc123
```

**TUNNEL-ID를 메모하세요!** (예: `abc123`)

#### Step 3: DNS 레코드 추가

```bash
cloudflared tunnel route dns c-auto c-auto.yourdomain.com
```

`yourdomain.com`을 본인의 Cloudflare 도메인으로 변경하세요.

#### Step 4: 설정 파일 생성

**Windows:** `C:\Users\user\.cloudflared\config.yml`

```yaml
tunnel: abc123  # 본인의 TUNNEL-ID
credentials-file: C:\Users\user\.cloudflared\abc123.json  # 본인의 파일

ingress:
  - hostname: c-auto.yourdomain.com  # 본인의 도메인
    service: http://localhost:8000
  - service: http_status:404
```

#### Step 5: 서버 및 터널 시작

**방법 A: 수동 실행**

터미널 1:
```bash
cd e:\c-auto
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

터미널 2:
```bash
cloudflared tunnel run c-auto
```

**방법 B: 스크립트 실행**
```bash
start-tunnel-permanent.bat
```

#### Step 6: 완료!

접속: `https://c-auto.yourdomain.com`

---

### Windows 서비스로 설치 (자동 시작)

항상 백그라운드에서 실행되도록 설정:

```bash
# 관리자 권한으로 CMD 실행 후
cloudflared service install
cloudflared service start
```

이제 Windows 시작 시 자동으로 터널이 실행됩니다!

**FastAPI 서버도 자동 시작:**

1. `task scheduler` 실행
2. 새 작업 만들기:
   - 이름: `C-Auto Server`
   - 트리거: `시스템 시작 시`
   - 작업: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
   - 시작 위치: `e:\c-auto`

---

## 🌐 방법 2: Cloudflare Pages + Render (무료)

완전 클라우드 배포를 원하면:

### Step 1: Render에 백엔드 배포 (무료)

1. **Render 접속**: https://render.com/
2. **New Web Service**
3. **GitHub 연결**: `kimhi1983/c-auto`
4. **설정**:
   ```
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
   Plan: Free
   ```
5. **환경 변수 추가**:
   ```
   OPENAI_API_KEY=your_key
   ANTHROPIC_API_KEY=your_key
   EMAIL_USER=your_email
   EMAIL_PASS=your_password
   IMAP_SERVER=pop.hiworks.com
   IMAP_PORT=995
   DROPBOX_PATH=/app/data
   EXCLUDE_FOLDER=회사 자료
   AI_WORK_DIR=AI 업무폴더
   ```

6. **배포 완료!** URL 메모 (예: `https://c-auto.onrender.com`)

### Step 2: Cloudflare DNS 연결

1. **Cloudflare Dashboard**: https://dash.cloudflare.com/
2. **도메인 선택**
3. **DNS 메뉴**
4. **레코드 추가**:
   ```
   Type: CNAME
   Name: c-auto
   Target: c-auto.onrender.com  (Render URL)
   Proxy: ON (주황색 구름)
   ```

5. **완료!** 접속: `https://c-auto.yourdomain.com`

---

## 📊 비교표

| 항목 | Cloudflare Tunnel | Render + Cloudflare |
|------|-------------------|---------------------|
| **비용** | 완전 무료 | 완전 무료 |
| **서버 관리** | 필요 (로컬/VPS) | 불필요 |
| **성능** | 매우 빠름 | 빠름 |
| **Sleep 모드** | 없음 | 15분 후 sleep |
| **설정 난이도** | 쉬움 | 매우 쉬움 |
| **권장 용도** | 항상 실행 | 가끔 사용 |

---

## 💡 추천

### 🏠 **집/사무실 PC가 있다면**
→ **Cloudflare Tunnel** 사용
- 완전 무료
- 빠른 응답
- Sleep 없음

### 🌐 **완전 클라우드를 원한다면**
→ **Render (무료) + Cloudflare**
- 서버 관리 불필요
- 어디서나 접속
- 15분 sleep 있지만 무료

---

## 🆘 문제 해결

### Tunnel이 시작되지 않는 경우

1. **Cloudflared 재설치**:
   ```bash
   winget install --id Cloudflare.cloudflared
   ```

2. **로그인 확인**:
   ```bash
   cloudflared tunnel login
   ```

3. **터널 목록 확인**:
   ```bash
   cloudflared tunnel list
   ```

### 도메인 접속이 안 되는 경우

1. **DNS 전파 대기**: 최대 1시간
2. **DNS 확인**:
   ```bash
   nslookup c-auto.yourdomain.com
   ```
3. **Cloudflare SSL/TLS**: Full 모드 확인

---

## 🎉 완료!

배포가 완료되면:
- ✅ 본인 도메인으로 접속: `https://c-auto.yourdomain.com`
- ✅ HTTPS 자동 적용
- ✅ 전세계 어디서나 접속 가능
- ✅ 모바일에서도 완벽하게 작동

---

## 📱 다음 단계

배포 후:
1. ✅ 모바일에서 테스트
2. ✅ AI 채팅 기능 테스트
3. ✅ 이메일 분석 테스트
4. ✅ 재고 관리 테스트

궁금한 점이 있으면 언제든지 물어보세요! 🚀
