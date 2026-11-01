@echo off
rem Windows: open Solist Hub at http://localhost:9000. Closing the Hub window stops every tool.
cd /d "%~dp0hub"
where pyw >nul 2>nul
if errorlevel 1 (start "" pythonw hub.py --app) else (start "" pyw -3 hub.py --app)
