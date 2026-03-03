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
echo =========================================
echo   Setup complete!
echo   Run start-all.bat to launch the app.
echo =========================================
pause
