@echo off
REM Double-click to start DropFix and open the website.
REM Reuses the same Python env / built website every time -- only
REM reinstalls or rebuilds when requirements.txt / package.json actually
REM changed since the last successful run, so a normal daily launch needs
REM no internet and stays fast. The server then runs minimized in the
REM taskbar; close that window to stop DropFix.

setlocal enabledelayedexpansion
cd /d "%~dp0"
set "ROOT=%CD%"
set "PORT=8001"
set "URL=http://127.0.0.1:%PORT%"
set "PYTHON=%ROOT%\backend\.venv\Scripts\python.exe"
set "PIP=%ROOT%\backend\.venv\Scripts\pip.exe"
set "REQS=%ROOT%\backend\requirements.txt"
set "REQS_HASH=%ROOT%\backend\.venv\.reqs_hash"
set "DIST=%ROOT%\frontend-react\dist\index.html"
set "PKG=%ROOT%\frontend-react\package.json"
set "PKG_HASH=%ROOT%\frontend-react\dist\.pkg_hash"

echo ========================================
echo   DropFix
echo ========================================
echo.

REM Already running? Just open the browser.
powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Already running - opening browser.
  start "" "%URL%"
  pause
  exit /b 0
)

REM --- Python environment: created once, reused every time. Packages
REM     are only (re)installed when requirements.txt changed since the
REM     last successful install, tracked by a hash file inside .venv. ---
if not exist "%PYTHON%" (
  echo Creating Python environment...
  python -m venv "%ROOT%\backend\.venv"
  if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3 and tick "Add to PATH", then try again.
    pause
    exit /b 1
  )
)

for /f "delims=" %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -Path '%REQS%').Hash"') do set "CURRENT_REQS_HASH=%%H"
set "SAVED_REQS_HASH="
if exist "%REQS_HASH%" set /p SAVED_REQS_HASH=<"%REQS_HASH%"

if not "!CURRENT_REQS_HASH!"=="!SAVED_REQS_HASH!" (
  echo Installing/updating Python packages...
  "%PIP%" install -r "%REQS%"
  if errorlevel 1 (
    echo ERROR: Could not install Python packages.
    pause
    exit /b 1
  )
  > "%REQS_HASH%" echo !CURRENT_REQS_HASH!
) else (
  echo Python packages already up to date - skipped.
)

REM --- Website build: same idea -- only rebuilds when package.json
REM     changed since the last build, tracked by a hash file inside dist. ---
set "NEED_JS_BUILD=0"
if not exist "%DIST%" set "NEED_JS_BUILD=1"
for /f "delims=" %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -Path '%PKG%').Hash"') do set "CURRENT_PKG_HASH=%%H"
set "SAVED_PKG_HASH="
if exist "%PKG_HASH%" set /p SAVED_PKG_HASH=<"%PKG_HASH%"
if not "!CURRENT_PKG_HASH!"=="!SAVED_PKG_HASH!" set "NEED_JS_BUILD=1"

if "%NEED_JS_BUILD%"=="1" (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo ERROR: npm not found. Install Node.js from https://nodejs.org then run this again.
    pause
    exit /b 1
  )
  echo Building website...
  pushd "%ROOT%\frontend-react"
  call npm install
  if errorlevel 1 (
    popd
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
  call npm run build
  if errorlevel 1 (
    popd
    echo ERROR: npm run build failed.
    pause
    exit /b 1
  )
  popd
  > "%PKG_HASH%" echo !CURRENT_PKG_HASH!
) else (
  echo Website already up to date - skipped.
)

REM --- Launch: backend runs minimized in its own taskbar window; this
REM     launcher window's job is done once it's started. ---
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

echo.
echo Starting Shop App (minimized) and opening %URL%
echo Close the "Shop App" window in the taskbar to stop it.
cd /d "%ROOT%"
start "Shop App" /min "%PYTHON%" -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%
timeout /t 2 /nobreak >nul
