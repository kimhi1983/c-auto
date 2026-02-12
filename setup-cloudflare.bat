@echo off
echo ========================================
echo Cloudflare Tunnel 영구 설정
echo ========================================
echo.

REM 1단계: Cloudflare 로그인
echo [1/4] Cloudflare 계정에 로그인하세요...
cloudflared tunnel login
echo.

REM 2단계: 터널 생성
echo [2/4] 터널 생성 중...
cloudflared tunnel create c-auto
echo.

REM 3단계: 도메인 입력 받기
echo [3/4] 도메인 설정
set /p DOMAIN="사용할 도메인을 입력하세요 (예: c-auto.yourdomain.com): "

REM 4단계: DNS 레코드 추가
echo [4/4] DNS 레코드 추가 중...
cloudflared tunnel route dns c-auto %DOMAIN%
echo.

echo ========================================
echo 설정 완료!
echo ========================================
echo.
echo 다음 명령어로 터널을 시작하세요:
echo   cloudflared tunnel run c-auto
echo.
echo 또는 start-tunnel-permanent.bat를 실행하세요.
echo.

pause
