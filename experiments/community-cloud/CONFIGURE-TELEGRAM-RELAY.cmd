@echo off
setlocal
cd /d "%~dp0"
title Istaroth Community - Private Telegram Relay
color 0B
echo.
echo ========================================================
echo     ISTAROTH - CONNECT PRIVATE TELEGRAM RELAY
echo     Preserves D1, DATA_KEY and Telegram webhook
echo ========================================================
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure_relay.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (echo Setup finished. Open Istaroth and send a test notification.) else (echo Read the error above.)
pause
exit /b %RESULT%
