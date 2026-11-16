@echo off
chcp 65001 >nul
setlocal
title Vertice - publicar en internet
cd /d "%~dp0"

REM Carpetas habituales de Node.js y cloudflared, por si el PATH aun no se ha actualizado tras instalarlos.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Microsoft\WinGet\Links;%ProgramFiles(x86)%\cloudflared;%ProgramFiles%\cloudflared"

where node >nul 2>nul
if not errorlevel 1 goto tiene_node
echo.
echo No encuentro Node.js. Intento instalarlo con winget (acepta los avisos de Windows)...
where winget >nul 2>nul
if errorlevel 1 goto sin_winget_node
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
set "PATH=%PATH%;%ProgramFiles%\nodejs"
where node >nul 2>nul
if not errorlevel 1 goto tiene_node
:sin_winget_node
echo.
echo No he podido instalar Node.js automaticamente.
echo  1. Descarga la version LTS en https://nodejs.org e instalala (deja marcadas las opciones por defecto).
echo  2. Cierra esta ventana y vuelve a hacer doble clic en publicar.bat.
start "" https://nodejs.org
pause
exit /b 1

:tiene_node
where cloudflared >nul 2>nul
if not errorlevel 1 goto tiene_cloudflared
echo.
echo No encuentro cloudflared. Intento instalarlo con winget...
where winget >nul 2>nul
if errorlevel 1 goto sin_winget_cf
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
where cloudflared >nul 2>nul
if not errorlevel 1 goto tiene_cloudflared
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles%\cloudflared\cloudflared.exe"
if defined CLOUDFLARED goto tiene_cloudflared
:sin_winget_cf
echo.
echo No he podido instalar cloudflared automaticamente.
echo  1. Descargalo para Windows desde la pagina que se abre (cloudflared-windows-amd64.msi) e instalalo.
echo  2. Cierra esta ventana y vuelve a hacer doble clic en publicar.bat.
start "" https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
pause
exit /b 1

:tiene_cloudflared
node scripts\publicar.mjs
echo.
pause
