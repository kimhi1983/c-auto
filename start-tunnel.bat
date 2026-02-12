@echo off
echo ========================================
echo C-Auto Cloudflare Tunnel Launcher
echo ========================================
echo.
echo Starting Cloudflare Tunnel...
echo Local Server: http://localhost:8000
echo.

cloudflared tunnel --url http://localhost:8000

pause
