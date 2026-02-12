@echo off
echo ========================================
echo C-Auto 영구 터널 시작
echo ========================================
echo.

REM FastAPI 서버 시작
echo [1/2] FastAPI 서버 시작 중...
start "C-Auto Server" cmd /k "cd /d e:\c-auto && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

REM 서버 시작 대기
timeout /t 5 /nobreak

REM Cloudflare Tunnel 시작
echo [2/2] Cloudflare Tunnel 시작 중...
echo.
echo 터널이 시작되었습니다!
echo 본인의 도메인으로 접속하세요.
echo.

cloudflared tunnel run c-auto

pause
