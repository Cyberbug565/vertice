@echo off
chcp 65001 >nul
setlocal
title Vertice - iniciar en local
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas Node.js LTS 22.12 o superior: https://nodejs.org
  pause
  exit /b 1
)
node scripts\local.mjs
echo.
pause
