@echo off
cd /d "%~dp0"
title Solist PDF
rem Windows: start Solist PDF at http://localhost:8090. Close this window to stop.
if not exist out\index.html call setup.bat nopause
echo Solist PDF: http://localhost:8090  (close this window to stop)

python ..\hub\static_server.py out 8090
pause
