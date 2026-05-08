@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo Squash Match Lab backend
echo URL: http://127.0.0.1:8000
echo ========================================

if not exist "backend\.venv\Scripts\python.exe" (
    echo Creating Python virtual environment in backend\.venv...
    where py >nul 2>nul
    if %errorlevel%==0 (
        py -3.12 -m venv backend\.venv
    ) else (
        python -m venv backend\.venv
    )
)

call backend\.venv\Scripts\activate.bat

python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt

cd /d "%~dp0\backend"
set PYTHONPATH=%CD%

echo.
echo Starting FastAPI backend at http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
