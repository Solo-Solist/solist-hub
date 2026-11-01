@echo off
rem Windows: put Solist Hub online through ngrok, behind a username and password (see share.py).
setlocal
cd /d "%~dp0"
set "BASE="
where py >nul 2>nul && set "BASE=py -3"
if not defined BASE (
  where python >nul 2>nul && set "BASE=python"
)
if not defined BASE goto nopython
%BASE% share.py %*
goto end

:nopython
echo Python was not found. Install it with:
echo   winget install -e --id Python.Python.3.12

:end
pause
