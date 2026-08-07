@echo off
title Personel Izin Takip Sistemi - Sunucu
color 0A
cls

echo ============================================================
echo     ANKARA ADLIYESI BILGI ISLEM MUDURLUGU
echo     Personel Izin ve Rapor Takip Sistemi
echo ============================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo HATA: Node.js bulunamadi!
    echo Lutfen https://nodejs.org adresinden Node.js LTS surumunu kurun.
    pause
    exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules" (
    echo Ilk calistirma - bagimliliklar yukleniyor, lutfen bekleyin...
    npm install
    echo.
)

for /f "tokens=*" %%i in ('hostname') do set HOSTNAME=%%i

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo.
echo ============================================================
echo  YEREL ERISIM   : http://localhost:5173
echo  AG ERISIMI     : http://%IP%:5173
echo  BILGISAYAR ADI : http://%HOSTNAME%:5173
echo ============================================================
echo.
echo Diger bilgisayarlar AG ERISIMI linkini tarayiciya yazsin.
echo Bu pencereyi KAPATMAYIN! Kapatilirsa sistem durur.
echo.

timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

npm run dev
pause
