@echo off
rem Windows: one-time setup for Solist PDF. Needs Node.js 20 or newer.
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is needed: https://nodejs.org ^(version 20+^) & goto end)
call npm ci
set NEXT_PUBLIC_LOCALES=en
call npm run build
echo Setup finished. Start with start.bat
:end
if not "%1"=="nopause" pause
