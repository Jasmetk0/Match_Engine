@echo off
setlocal

cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
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

cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
