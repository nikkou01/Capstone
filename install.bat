@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "MOBILE_DIR=%ROOT%mobile-responder"
set "BACKEND_VENV=%BACKEND_DIR%\.venv"
set "BACKEND_PYTHON=%BACKEND_VENV%\Scripts\python.exe"
set "BACKEND_ENV_FILE=%BACKEND_DIR%\.env"
set "BACKEND_ENV_TEMPLATE=%BACKEND_DIR%\.env.example"

echo =========================================
echo   SafeSight - First-Time Setup
echo =========================================

where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    echo Install Python 3.10+ and try again.
    pause & exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm is not installed or not in PATH.
    echo Install Node.js (with npm) and try again.
    pause & exit /b 1
)

echo.
echo [1/6] Creating Python virtual environment...
if not exist "%BACKEND_PYTHON%" (
    python -m venv "%BACKEND_VENV%"
    if errorlevel 1 (
        echo ERROR: Failed to create backend virtual environment.
        pause & exit /b 1
    )
) else (
    echo Backend virtual environment already exists.
)

echo.
echo [2/6] Installing backend dependencies...
"%BACKEND_PYTHON%" -m pip install --disable-pip-version-check -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies.
    pause & exit /b 1
)

echo.
echo [3/6] Preparing backend configuration...
if not exist "%BACKEND_ENV_FILE%" (
    if exist "%BACKEND_ENV_TEMPLATE%" (
        copy /Y "%BACKEND_ENV_TEMPLATE%" "%BACKEND_ENV_FILE%" >nul
        if errorlevel 1 (
            echo ERROR: Failed to create backend\.env from template.
            pause & exit /b 1
        )
        echo Created backend\.env from backend\.env.example.
    ) else (
        echo WARNING: backend\.env.example is missing.
        echo Create backend\.env manually before launching SafeSight.
    )
) else (
    echo backend\.env already exists.
)

if not exist "%BACKEND_DIR%\models" mkdir "%BACKEND_DIR%\models"
if not exist "%BACKEND_DIR%\models\best.pt" (
    echo.
    echo WARNING: YOLO model file not found at backend\models\best.pt
    echo Collision detection will stay disabled until the model file is available.
    echo If this is a fresh clone, pull latest changes or copy best.pt to backend\models.
)

echo.
echo [4/6] Installing frontend dependencies...
cd /d "%FRONTEND_DIR%"
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies. Make sure Node.js is installed.
    pause & exit /b 1
)

echo.
echo [5/6] Installing mobile responder dependencies...
if exist "%MOBILE_DIR%\package.json" (
    cd /d "%MOBILE_DIR%"
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install mobile-responder dependencies.
        pause & exit /b 1
    )
) else (
    echo mobile-responder folder not found. Skipping mobile dependency install.
)

echo.
echo [6/6] Checking MongoDB service...
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
echo   For mobile app run: cd mobile-responder ^&^& npm run start
echo   Database is created automatically on first run.
echo   Default login is auto-created: captain / password
echo   See NEW_DESKTOP_SETUP.md for full step-by-step setup.
echo =========================================
endlocal
pause
