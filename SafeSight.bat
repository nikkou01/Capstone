@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"

if not exist "%BACKEND_DIR%\.venv\Scripts\python.exe" (
    echo ERROR: Backend virtual environment is missing.
    echo Run install.bat first, then try again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm is not installed or not in PATH.
    echo Install Node.js, then run install.bat.
    pause
    exit /b 1
)

echo =========================================
echo   SafeSight - Desktop Mode
echo =========================================
echo Ensuring MongoDB service is running...

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
            echo Start MongoDB manually if the app cannot connect to database.
        ) else (
            echo MongoDB service started.
        )
    ) else (
        echo MongoDB service is already running.
    )
)

echo Starting backend, frontend, and desktop window...

cd /d "%FRONTEND_DIR%"
call npm run desktop

if errorlevel 1 (
    echo.
    echo ERROR: Desktop mode failed to start.
    echo Run install.bat and try again.
    pause
    exit /b 1
)

endlocal
