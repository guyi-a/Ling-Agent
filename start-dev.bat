@echo off
chcp 65001 >nul

echo [Ling-Agent] Starting dev environment...
echo.

start "Ling-Agent Backend (port 9000)" cmd /k "cd /d %~dp0agent-service && call venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 9000 --reload --reload-dir app --reload-exclude 'workspace/*' --reload-exclude 'data/*'"

timeout /t 2 >nul

start "Ling-Agent Frontend (port 5174)" cmd /k "cd /d %~dp0web && npm run dev"

echo.
echo   Frontend: http://localhost:5174
echo   Backend:  http://localhost:9000
echo   API Docs: http://localhost:9000/docs
echo.
echo Close the opened windows to stop services.
