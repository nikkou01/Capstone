@echo off
echo =========================================
echo   SafeCCTV - First-Time Setup
echo =========================================

echo.
echo [1/3] Creating Python virtual environment...
python -m venv "%~dp0backend\.venv"
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.10+ and try again.
    pause & exit /b 1
)

echo.
echo [2/3] Installing backend dependencies...
"%~dp0backend\.venv\Scripts\pip.exe" install -r "%~dp0backend\requirements.txt"
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies.
    pause & exit /b 1
)

echo.
echo [3/3] Installing frontend dependencies...
cd /d "%~dp0frontend"
npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies. Make sure Node.js is installed.
    pause & exit /b 1
)

echo.
choice /C YN /N /M "[Optional] Reset MongoDB database to clean state now? [Y/N]: "
if errorlevel 2 goto skipdbreset

echo.
echo Resetting database...
"%~dp0backend\.venv\Scripts\python.exe" "%~dp0backend\reset_db.py" --yes
if errorlevel 1 (
    echo WARNING: Database reset failed. Make sure MongoDB is running, then run reset-db.bat.
) else (
    echo Database reset completed.
)

:skipdbreset

echo.
echo =========================================
echo   Setup complete!
echo   Run start-all.bat to launch the app.
echo   Optional: run reset-db.bat anytime for a clean database.
echo   See README.md for the another-device setup checklist.
echo =========================================
pause
