@echo off
REM Double-click to start DropFix and open the website.
REM First click: one-time setup. Later clicks: start only (no reinstall).
REM Keep this window open while you use the shop. Close it to stop.

setlocal
cd /d "%~dp0"
set "ROOT=%CD%"
set "PORT=8001"
set "URL=http://127.0.0.1:%PORT%"
set "PYTHON=%ROOT%\backend\.venv\Scripts\python.exe"
set "PIP=%ROOT%\backend\.venv\Scripts\pip.exe"
set "READY=%ROOT%\backend\.setup_complete"
set "DIST=%ROOT%\frontend-react\dist\index.html"

echo ========================================
echo   DropFix
echo ========================================
echo.

set "NEED_SETUP=0"
if not exist "%PYTHON%" set "NEED_SETUP=1"
if not exist "%DIST%" set "NEED_SETUP=1"
if not exist "%READY%" set "NEED_SETUP=1"

if "%NEED_SETUP%"=="1" (
  echo First-time setup ^(only runs once^)…
  echo.

  if not exist "%PYTHON%" (
    echo → Creating Python environment…
    python -m venv "%ROOT%\backend\.venv"
    if errorlevel 1 (
      echo ERROR: Python not found. Install Python 3 and tick "Add to PATH", then try again.
      pause
      exit /b 1
    )
    echo → Installing Python packages…
    "%PIP%" install -r "%ROOT%\backend\requirements.txt"
    if errorlevel 1 (
      echo ERROR: Could not install Python packages.
      pause
      exit /b 1
    )
  ) else (
    echo → Python environment already exists — skipped.
  )

  if not exist "%DIST%" (
    echo → Building website…
    where npm >nul 2>&1
    if errorlevel 1 (
      echo ERROR: npm not found. Install Node.js from https://nodejs.org then run this again.
      pause
      exit /b 1
    )
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
  ) else (
    echo → Website already built — skipped.
  )

  echo setup complete > "%READY%"
  echo.
  echo Setup finished. Next time this will only start the app.
  echo.
) else (
  echo Already set up — starting only ^(no install / rebuild^).
  echo.
)

REM Already running? Just open the browser
powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($c) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Already running — opening browser.
  start "" "%URL%"
  pause
  exit /b 0
)

REM Open browser after a short wait for the server
start "" cmd /c "timeout /t 2 /nobreak >nul & start \"\" \"%URL%\""

echo Opening %URL%
echo Leave this window open. Close it to stop DropFix.
echo.

cd /d "%ROOT%"
"%PYTHON%" -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%
echo.
echo DropFix stopped.
pause
