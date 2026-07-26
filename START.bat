@echo off
cd /d "%~dp0"
set ALLOW_LAN=1
set NODE_ENV=production
node server.js
pause
