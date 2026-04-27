@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "MOBILE_DIR=%ROOT%mobile-responder"
set "PREFLIGHT_SCRIPT=%ROOT%preflight.bat"
set "BACKEND_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "BACKEND_ENV_FILE=%BACKEND_DIR%\.env"
set "BACKEND_ENV_TEMPLATE=%BACKEND_DIR%\.env.example"
set "LAN_IP="
set "MOBILE_API_URL="

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

if exist "%PREFLIGHT_SCRIPT%" (
    echo Running preflight checks...
    call "%PREFLIGHT_SCRIPT%"
    if errorlevel 1 (
        echo.
        echo ERROR: Preflight checks failed.
        echo Resolve the failed checks above, then run SafeSight.bat again.
        pause
        exit /b 1
    )
) else (
    echo WARNING: preflight.bat not found. Continuing without preflight checks.
)

echo =========================================
echo   SafeSight - Desktop Mode
echo =========================================

if not exist "%BACKEND_ENV_FILE%" (
    if exist "%BACKEND_ENV_TEMPLATE%" (
        copy /Y "%BACKEND_ENV_TEMPLATE%" "%BACKEND_ENV_FILE%" >nul
        if errorlevel 1 (
            echo ERROR: Failed to create backend\.env from template.
            pause
            exit /b 1
        )
        echo Created backend\.env from backend\.env.example.
    ) else (
        echo ERROR: backend\.env is missing and backend\.env.example was not found.
        echo Run install.bat or restore backend\.env.example.
        pause
        exit /b 1
    )
)

if not exist "%BACKEND_DIR%\models\best.pt" (
    echo WARNING: backend\models\best.pt was not found.
    echo Live AI collision detection may stay disabled until the model exists.
)

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

if exist "%MOBILE_DIR%\package.json" (
    echo Resolving LAN IP for mobile API...
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue ^| Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } ^| Select-Object -First 1 -ExpandProperty IPAddress); if($ip){$ip}else{'127.0.0.1'}"`) do set "LAN_IP=%%I"
    if not defined LAN_IP set "LAN_IP=127.0.0.1"
    set "MOBILE_API_URL=http://%LAN_IP%:8000/api"

    echo Starting mobile responder app in a new terminal...
    start "SafeSight Mobile (Expo)" cmd /k "cd /d ""%MOBILE_DIR%"" && set EXPO_PUBLIC_API_BASE_URL=%MOBILE_API_URL% && npm run start -- --tunnel --clear"
    echo Mobile API URL: %MOBILE_API_URL%
) else (
    echo mobile-responder folder not found. Skipping mobile app launch.
)

echo Starting backend, frontend, desktop window...

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
