@echo off
setlocal

cd /d "%~dp0\frontend"

echo ========================================
echo Squash Match Lab frontend
echo URL: http://127.0.0.1:5173
echo ========================================

if not exist "node_modules" (
    echo Installing frontend packages...
    npm install
)

echo.
echo Starting Vite frontend at http://127.0.0.1:5173
echo Press Ctrl+C to stop.
echo.
npm run dev -- --host 127.0.0.1
