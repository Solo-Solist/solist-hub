@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  Nykaa mapper - one-time setup
echo ============================================

rem 1) reuse the scraper's virtual environment if it exists, otherwise use/create our own
set "PY="
if exist "..\.venv\Scripts\python.exe" set "PY=..\.venv\Scripts\python.exe"
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"

if not defined PY goto makevenv
goto install

:makevenv
where python >nul 2>nul
if errorlevel 1 goto nopython
echo Creating a virtual environment in this folder...
python -m venv .venv
if errorlevel 1 goto failed
set "PY=.venv\Scripts\python.exe"
goto install

:install
echo Using: %PY%
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 goto failed
echo.
echo Setup finished. Now drag your nykaa_products.csv onto run.bat
pause
exit /b 0

:nopython
echo.
echo Python was not found on this computer.
echo 1. Go to https://www.python.org/downloads/ and install Python 3.10 or newer.
echo 2. On the first installer screen tick  "Add python.exe to PATH".
echo 3. Close this window and double-click setup.bat again.
pause
exit /b 1

:failed
echo.
echo Something went wrong. Take a photo or copy of the red text above and send it to Claude.
pause
exit /b 1
