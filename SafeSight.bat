@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%BACKEND_PYTHON%" (
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

echo Checking for stale frontend/backend process on ports 5173, 8000, and 8001...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 5173,8000,8001 } | Select-Object -ExpandProperty OwningProcess -Unique); foreach ($procId in $pids) { if ($procId -gt 0) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('Stopped listener PID ' + $procId); continue } catch {} ; try { Start-Process -FilePath 'taskkill' -ArgumentList '/PID', $procId, '/T', '/F' -NoNewWindow -Wait | Out-Null; Write-Host ('Taskkill attempted for PID ' + $procId) } catch {} } }" >nul 2>nul

echo Verifying backend AI dependencies (ultralytics/torch)...
"%BACKEND_PYTHON%" -c "import ultralytics, torch, cv2, imageio_ffmpeg" >nul 2>nul
if errorlevel 1 (
    echo Installing missing backend dependencies. This may take a few minutes...
    "%BACKEND_PYTHON%" -m pip install --disable-pip-version-check -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install backend dependencies.
        echo Close any running backend Python processes and try again.
        pause
        exit /b 1
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
