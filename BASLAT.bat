@echo off
title Izin Sistemi Sunucu - Kapatmayin!
echo Izin Otomasyonu Baslatiliyor... Lutfen bekleyiniz...

:: Proje klasorune git
cd /d "%~dp0"

:: node_modules yoksa kur
if not exist "node_modules" (
    echo [!] Kurulum yapiliyor, bu islem biraz surebilir...
    npm install
)

:: Sunucuyu baslat
npm run start
