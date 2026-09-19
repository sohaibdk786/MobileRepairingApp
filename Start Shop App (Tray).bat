@echo off
REM Runs DropFix in the background with no window at all -- controlled
REM entirely from a tray icon (Open / Start / Stop / Exit). This is a
REM second, separate way to run the app -- it does NOT replace
REM Start Shop App.bat, which is still what does first-time setup
REM (creates the venv, installs packages, builds the website) and
REM should be run first on a new PC.

setlocal
cd /d "%~dp0"
set "PYTHONW=%CD%\backend\.venv\Scripts\pythonw.exe"
set "DIST=%CD%\frontend-react\dist\index.html"

if not exist "%PYTHONW%" (
  echo Run "Start Shop App.bat" first to set up the Python environment.
  pause
  exit /b 1
)
if not exist "%DIST%" (
  echo Run "Start Shop App.bat" first to build the website.
  pause
  exit /b 1
)

start "" "%PYTHONW%" -m backend.tray_app
