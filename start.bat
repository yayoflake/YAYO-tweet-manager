@echo off
chcp 65001 >nul 2>&1
title YAYO tweet manager
echo.
echo  YAYO tweet manager 서버를 시작합니다...
echo.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo  ❌ Node.js가 설치되어 있지 않습니다.
    echo  https://nodejs.org 에서 Node.js를 설치해주세요.
    echo.
    pause
    exit /b 1
)

start "" http://localhost:7890
node server.js
