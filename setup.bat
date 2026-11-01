@echo off
rem Windows: set up every project (or only the ones named: setup.bat pdfcraft accounting).
cd /d "%~dp0"
set PROJECTS=%*
if "%PROJECTS%"=="" set PROJECTS=map_scrapper nykaa-scraper nykaa_mapper pdfcraft upi-id accounting
for %%p in (%PROJECTS%) do (
  echo.
  echo === Setting up %%p ===
  call "%%p\setup.bat" nopause
)
echo.
echo Done. Start everything with launch.bat
pause
