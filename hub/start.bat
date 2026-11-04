@echo off
rem Windows: start Solist Hub with this console window open (shows errors). "..\launch.bat" opens it without one.
setlocal
cd /d "%~dp0"
set "BASE="
where py >nul 2>nul && set "BASE=py -3"
if not defined BASE (
  where python >nul 2>nul && set "BASE=python"
)
if not defined BASE goto nopython
%BASE% hub.py --app
goto end

:nopython
echo Python was not found. Install it with:
echo   winget install -e --id Python.Python.3.12

:end
pause
