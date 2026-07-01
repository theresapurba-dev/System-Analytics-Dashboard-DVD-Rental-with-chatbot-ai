@echo off

REM 1. Create virtual environment
echo [1/4] Creating virtual environment...
python -m venv venv

if errorlevel 1 (
echo ERROR: Could not create venv. Is Python installed?
pause
exit /b 1
)

REM 2. Activate venv and install packages
echo [2/4] Installing dependencies...
call venv\Scripts\activate.bat

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if errorlevel 1 (
echo ERROR: pip install failed.
pause
exit /b 1
)

REM 3. Create .env from template
echo [3/4] Creating .env file...

if not exist .env (
copy .env.example .env
echo .env created successfully.
) else (
echo .env already exists.
)

REM 4. Done
echo [4/4] Setup complete!
echo.
echo ============================================
echo NEXT STEPS:
echo ============================================
echo 1. Edit .env with PostgreSQL credentials
echo 2. Run SQL setup in pgAdmin
echo 3. Start backend:
echo    cd backend
echo    python app.py
echo 4. Open browser:
echo    http://127.0.0.1:5000
echo ============================================


