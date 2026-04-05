@echo off
cd /d "%~dp0"

if not exist "%~dp0backend\.venv\Scripts\python.exe" (
    echo ERROR: Backend virtual environment is missing.
    echo Run install.bat first.
    pause
    exit /b 1
)

echo Resetting SafeCCTV database to a clean state...
"%~dp0backend\.venv\Scripts\python.exe" "%~dp0backend\reset_db.py" --yes
if errorlevel 1 (
    echo ERROR: Database reset failed. Ensure MongoDB is running and try again.
    pause
    exit /b 1
)

echo Database reset complete. Start services with start-all.bat
pause
