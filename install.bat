@echo off
echo =========================================
echo   SafeSight - First-Time Setup
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
echo [Optional] Checking MongoDB service...
sc query MongoDB >nul 2>nul
if errorlevel 1 (
    echo WARNING: MongoDB service 'MongoDB' was not found.
    echo Install MongoDB Community Server if it is not installed yet.
) else (
    sc query MongoDB | find "RUNNING" >nul
    if errorlevel 1 (
        echo MongoDB is not running. Attempting to start service...
        net start MongoDB >nul 2>nul
        if errorlevel 1 (
            echo WARNING: Could not start MongoDB automatically.
            echo Start MongoDB manually before launching SafeSight.
        ) else (
            echo MongoDB service started.
        )
    ) else (
        echo MongoDB service is already running.
    )
)

echo.
echo =========================================
echo   Setup complete!
echo   Run SafeSight.bat to launch the app.
echo   Database is created automatically on first run.
echo   Default login is auto-created: captain / password
echo   See README.md for the another-device setup checklist.
echo =========================================
pause
