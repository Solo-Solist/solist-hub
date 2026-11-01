@echo off
setlocal
cd /d "%~dp0"

set "PY="
if exist "..\.venv\Scripts\python.exe" set "PY=..\.venv\Scripts\python.exe"
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY goto needsetup

rem Input: a CSV dragged onto this file, or the default one folder up
set "INPUT=%~1"
if "%INPUT%"=="" set "INPUT=..\nykaa_products.csv"
if not exist "%INPUT%" goto noinput

echo Reading: %INPUT%
"%PY%" mapper.py "%INPUT%" -o out
if errorlevel 1 goto failed
echo.
echo Done. Opening the out folder: import_ready.csv and review.csv
start "" "out"
pause
exit /b 0

:needsetup
echo Please double-click setup.bat first.
pause
exit /b 1

:noinput
echo Could not find "%INPUT%"
echo Drag your nykaa_products.csv file onto run.bat, or put it one folder above this one.
pause
exit /b 1

:failed
echo.
echo Something went wrong. Copy the red text above and send it to Claude.
pause
exit /b 1
