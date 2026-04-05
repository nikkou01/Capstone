@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"

if not exist "%BACKEND_DIR%\.venv\Scripts\uvicorn.exe" (
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
echo   SafeCCTV - Starting All Services
echo =========================================

echo [1/2] Starting Backend (port 8000)...
start "SafeCCTV Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && .venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak > nul

echo [2/2] Starting Frontend (port 5173)...
start "SafeCCTV Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"

echo.
echo  Backend  -^> http://localhost:8000
echo  Frontend -^> http://localhost:5173
echo  API Docs -^> http://localhost:8000/docs
echo.
pause

endlocal
