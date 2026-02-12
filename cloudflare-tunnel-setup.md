# Cloudflare Tunnel 영구 설정 가이드

## 1단계: Cloudflare 계정 로그인

```bash
cloudflared tunnel login
```

브라우저가 열리고 Cloudflare 계정으로 로그인하세요.

## 2단계: 터널 생성

```bash
cd e:\c-auto
cloudflared tunnel create c-auto
```

출력 예시:
```
Tunnel credentials written to C:\Users\user\.cloudflared\<TUNNEL-ID>.json
Created tunnel c-auto with id <TUNNEL-ID>
```

**중요**: TUNNEL-ID를 메모하세요!

## 3단계: DNS 레코드 추가

```bash
cloudflared tunnel route dns c-auto c-auto.yourdomain.com
```

자동으로 Cloudflare DNS에 CNAME 레코드가 추가됩니다.

## 4단계: 설정 파일 생성

`config.yml` 파일을 생성하세요:

**Windows**: `C:\Users\user\.cloudflared\config.yml`
**Linux/Mac**: `~/.cloudflared/config.yml`

```yaml
tunnel: <YOUR-TUNNEL-ID>
credentials-file: C:\Users\user\.cloudflared\<YOUR-TUNNEL-ID>.json

ingress:
  - hostname: c-auto.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

## 5단계: 터널 실행

```bash
cloudflared tunnel run c-auto
```

또는 서비스로 설치 (백그라운드 실행):

```bash
cloudflared service install
```

## 6단계: 완료!

이제 `https://c-auto.yourdomain.com` 으로 접속 가능합니다!

## 자동 시작 설정 (Windows)

`start-cloudflare-tunnel.bat` 파일:

```batch
@echo off
echo Starting C-Auto FastAPI Server...
start "C-Auto Server" cmd /k "cd /d e:\c-auto && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 5 /nobreak

echo Starting Cloudflare Tunnel...
cloudflared tunnel run c-auto

pause
```

## 서비스로 등록 (항상 실행)

```bash
cloudflared service install
cloudflared service start
```

이제 시스템 시작 시 자동으로 터널이 실행됩니다!
