@echo off
setlocal
cd /d "%~dp0"
title Istaroth Community - Safe Update
color 0B
echo.
echo ========================================================
echo        ISTAROTH - SAFE CLOUD UPDATE
 echo     Preserves D1, DATA_KEY, bot and webhook
 echo    No Telegram registration, no secret rotation
 echo ========================================================
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\quick_update.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (echo UPDATE COMPLETE. Open COMMUNITY-URL.txt.) else (echo Update stopped. Read the error above.)
pause
exit /b %RESULT%
