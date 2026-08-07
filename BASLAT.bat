@echo off
title Izin Sistemi Sunucu - Kapatmayin!

:: Proje klasorune git
cd /d "%~dp0"

:: node_modules yoksa kur
if not exist "node_modules" (
    npm install
)

:: IP ve hostname al
for /f "tokens=*" %%i in ('hostname') do set HOSTNAME=%%i
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

:: Tarayiciyi 3 saniye sonra ac
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

:: Sunucuyu arka planda baslat - bu pencere kucuk kalsin
npm run start
