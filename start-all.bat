@echo off
echo ========================================
echo C-Auto Complete Startup Script
echo ========================================
echo.

REM Start FastAPI Server
echo [1/2] Starting FastAPI Server on port 8000...
start "C-Auto Server" cmd /k "cd /d e:\c-auto && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

REM Wait for server to start
timeout /t 5 /nobreak

REM Start Cloudflare Tunnel
echo [2/2] Starting Cloudflare Tunnel...
start "C-Auto Tunnel" cmd /k "cd /d e:\c-auto && cloudflared tunnel --url http://localhost:8000"

echo.
echo ========================================
echo C-Auto is starting!
echo ========================================
echo.
echo Check the opened windows for:
echo 1. Server status and logs
echo 2. Cloudflare Tunnel URL
echo.

pause
