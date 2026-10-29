@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo A Node.js nincs telepitve. Toltsd le: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Elso inditas: csomagok telepitese...
  call npm install
)
call npm run build
call npm run start
pause
