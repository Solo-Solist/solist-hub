@echo off
setlocal
cd /d "%~dp0"
title Maps Scraper
rem Windows: start the Maps Scraper dashboard at http://localhost:5000. Close this window to stop.

if not exist ".venv\Scripts\python.exe" call setup.bat nopause
if not exist ".venv\Scripts\python.exe" goto end

echo Maps Scraper: http://localhost:5000  (close this window to stop)
rem Open the page in the browser as soon as the tool answers.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 180; $i++) { try { (New-Object Net.Sockets.TcpClient('127.0.0.1', 5000)).Close(); Start-Process 'http://localhost:5000'; break } catch { Start-Sleep 1 } }"
".venv\Scripts\python.exe" gmaps_dashboard.py

:end
pause
