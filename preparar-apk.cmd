@echo off
setlocal
cd /d "%~dp0"
echo Preparando Chase APK. Necesitas Node 22 o superior y tu .env.local en esta carpeta.
node scripts/prepare-apk.mjs
if errorlevel 1 goto failed
call npm ci
if errorlevel 1 goto failed
call npx eas-cli@latest login
if errorlevel 1 goto failed
call npx eas-cli@latest init
if errorlevel 1 goto failed
call npx eas-cli@latest build --platform android --profile preview
if errorlevel 1 goto failed
echo Abre el enlace de EAS para descargar e instalar el archivo APK.
pause
exit /b 0
:failed
echo No se completo la preparacion o compilacion. Copia el error que aparece arriba para revisarlo.
pause
exit /b 1
