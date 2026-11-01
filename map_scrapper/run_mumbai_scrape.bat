@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo Mumbai MMR sweets, cakes, pastries, namkeen and farsan scrape
echo ============================================================
echo.
echo This will run every query sequentially and merge CSV results.
echo Keep this window open until it says ALL QUERIES FINISHED.
echo.

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" "run_mumbai_scrape.py"
) else (
    python "run_mumbai_scrape.py"
)

echo.
echo Runner exited. Check the mumbai_scrape_output folder.
pause
