@echo off
setlocal
cd /d "%~dp0"
title Nykaa Studio

rem --- find the python environment: the scraper .venv (one folder up) or our own ---
set "PY="
if exist "..\.venv\Scripts\python.exe" set "PY=..\.venv\Scripts\python.exe"
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"

if not defined PY goto firsttime
"%PY%" -c "import pandas" >nul 2>nul
if errorlevel 1 goto install
goto launch

:firsttime
where python >nul 2>nul
if errorlevel 1 goto nopython
echo First start: creating the Python environment, this takes about a minute...
python -m venv .venv
if errorlevel 1 goto failed
set "PY=.venv\Scripts\python.exe"

:install
echo Installing what Studio needs, one time only...
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 goto failed

:launch
echo.
echo ============================================================
echo   Nykaa Studio is starting. Your browser will open at
echo   http://localhost:8766
echo   Leave this window open while you work. Close it to stop.
echo ============================================================
"%PY%" studio.py
echo.
echo Studio stopped.
pause
exit /b 0

:nopython
echo.
echo Python was not found. Install Python 3.10 or newer from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH" on the first screen. Then double-click start.bat again.
pause
exit /b 1

:failed
echo.
echo Something went wrong. Copy the red text above and send it to Claude.
pause
exit /b 1
