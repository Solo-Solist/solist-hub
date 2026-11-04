@echo off
cd /d "%~dp0"
title Solist Draw
rem Windows: start Solist Draw at http://localhost:8093. Close this window to stop.
if not exist excalidraw-app\build\index.html call setup.bat nopause
echo Solist Draw: http://localhost:8093  (close this window to stop)

python ..\hub\static_server.py excalidraw-app\build 8093
pause
