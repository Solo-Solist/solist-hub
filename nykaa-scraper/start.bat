@echo off
setlocal
cd /d "%~dp0"
title Nykaa Scraper
rem Windows: start the Nykaa Scraper dashboard at http://localhost:8765. Close this window to stop.

if not exist ".venv\Scripts\python.exe" call setup.bat nopause
if not exist ".venv\Scripts\python.exe" goto end

echo Nykaa Scraper: http://localhost:8765  (close this window to stop)
".venv\Scripts\python.exe" dashboard.py

:end
pause
