@echo off
setlocal
cd /d "%~dp0"
title Nykaa Scraper setup
rem Windows: one-time setup. Makes .venv (Ubuntu keeps its own .venv-linux here) and installs requirements.txt.

set "PY=.venv\Scripts\python.exe"
if exist "%PY%" goto install

set "BASE="
where py >nul 2>nul && set "BASE=py -3"
if not defined BASE (
  where python >nul 2>nul && set "BASE=python"
)
if not defined BASE goto nopython
%BASE% -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>nul || goto nopython
echo Creating .venv ...
%BASE% -m venv .venv || goto failed

:install
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements.txt || goto failed
echo Downloading the browsers Scrapling uses (one time) ...
".venv\Scripts\scrapling.exe" install || echo [warn] "scrapling install" failed - see the messages above.
echo.
echo Setup finished. Start with start.bat
goto end

:nopython
echo.
echo Python 3.10 or newer was not found. Install it with:
echo   winget install -e --id Python.Python.3.12
echo (or from https://www.python.org/downloads/ - tick "Add python.exe to PATH"), then run this again.
goto end

:failed
echo.
echo Setup failed - see the messages above.

:end
if /i not "%~1"=="nopause" pause
