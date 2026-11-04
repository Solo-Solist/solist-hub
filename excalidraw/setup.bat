@echo off
rem Windows: one-time setup for Solist Draw. Needs Node.js 18 or newer.
cd /d "%~dp0"
where npx >nul 2>nul || (echo Node.js is needed: https://nodejs.org ^(version 18+^) & goto end)
call npx --yes yarn@1.22.22 install --frozen-lockfile
call npx --yes yarn@1.22.22 build:app:docker
echo Setup finished. Start with start.bat
:end
if not "%1"=="nopause" pause
