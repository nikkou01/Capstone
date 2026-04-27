@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "MOBILE_DIR=%ROOT%mobile-responder"
set "BACKEND_ENV_FILE=%BACKEND_DIR%\.env"
set "BACKEND_ENV_TEMPLATE=%BACKEND_DIR%\.env.example"
set "HAS_ERROR=0"
set "HAS_WARN=0"

echo =========================================
echo   SafeSight Preflight Check
echo =========================================
echo Root: %ROOT%

where python >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Python not found in PATH.
    set "HAS_ERROR=1"
) else (
    for /f "tokens=*" %%V in ('python --version 2^>nul') do set "PY_VER=%%V"
    echo [ OK ] Python detected ^(%PY_VER%^).
)

where node >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Node.js not found in PATH.
    set "HAS_ERROR=1"
) else (
    for /f "tokens=*" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
    echo [ OK ] Node.js detected ^(%NODE_VER%^).
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [FAIL] npm not found in PATH.
    set "HAS_ERROR=1"
) else (
    for /f "tokens=*" %%V in ('npm -v 2^>nul') do set "NPM_VER=%%V"
    echo [ OK ] npm detected ^(%NPM_VER%^).
)

if not exist "%BACKEND_DIR%\main.py" (
    echo [FAIL] Backend folder is missing or invalid: %BACKEND_DIR%
    set "HAS_ERROR=1"
) else (
    echo [ OK ] Backend folder found.
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo [FAIL] Frontend folder is missing or invalid: %FRONTEND_DIR%
    set "HAS_ERROR=1"
) else (
    echo [ OK ] Frontend folder found.
)

if not exist "%MOBILE_DIR%\package.json" (
    echo [WARN] mobile-responder folder not found.
    set "HAS_WARN=1"
) else (
    echo [ OK ] mobile-responder folder found.
)

if exist "%BACKEND_ENV_FILE%" (
    echo [ OK ] backend\.env found.
) else (
    if exist "%BACKEND_ENV_TEMPLATE%" (
        echo [WARN] backend\.env missing, but template exists and can be auto-created.
        set "HAS_WARN=1"
    ) else (
        echo [FAIL] backend\.env and backend\.env.example are both missing.
        set "HAS_ERROR=1"
    )
)

if not exist "%BACKEND_DIR%\.venv\Scripts\python.exe" (
    echo [WARN] backend virtual environment not found yet. Run install.bat.
    set "HAS_WARN=1"
) else (
    echo [ OK ] backend virtual environment found.
)

if not exist "%BACKEND_DIR%\models\best.pt" (
    echo [WARN] backend\models\best.pt not found. Live detection may be disabled.
    set "HAS_WARN=1"
) else (
    echo [ OK ] Detection model file found.
)

sc query MongoDB >nul 2>nul
if errorlevel 1 (
    echo [WARN] MongoDB service not found. Install MongoDB Community Server.
    set "HAS_WARN=1"
) else (
    sc query MongoDB | find "RUNNING" >nul
    if errorlevel 1 (
        echo [WARN] MongoDB service found but not running.
        set "HAS_WARN=1"
    ) else (
        echo [ OK ] MongoDB service running.
    )
)

echo =========================================
if "%HAS_ERROR%"=="1" (
    echo Preflight result: FAILED
    echo Fix the [FAIL] items before running SafeSight.
    endlocal & exit /b 1
)

if "%HAS_WARN%"=="1" (
    echo Preflight result: PASS with warnings
    endlocal & exit /b 0
)

echo Preflight result: PASS
endlocal & exit /b 0
