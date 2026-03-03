@echo off
echo =========================================
echo   SafeCCTV - Starting All Services
echo =========================================

echo [1/2] Starting Backend (port 8000)...
start "SafeCCTV Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak > nul

echo [2/2] Starting Frontend (port 5173)...
start "SafeCCTV Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  Backend  -^> http://localhost:8000
echo  Frontend -^> http://localhost:5173
echo  API Docs -^> http://localhost:8000/docs
echo.
pause
