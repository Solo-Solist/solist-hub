@echo off
setlocal
cd /d "%~dp0"
set "PY="
if exist "..\.venv\Scripts\python.exe" set "PY=..\.venv\Scripts\python.exe"
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY goto needsetup
set "INPUT=%~1"
if "%INPUT%"=="" set "INPUT=..\nykaa_products.csv"
if not exist "%INPUT%" goto noinput
"%PY%" mapper.py "%INPUT%" --inspect
pause
exit /b 0
:needsetup
echo Please double-click setup.bat first.
pause
exit /b 1
:noinput
echo Could not find "%INPUT%"
echo Drag your nykaa_products.csv file onto inspect.bat.
pause
exit /b 1
