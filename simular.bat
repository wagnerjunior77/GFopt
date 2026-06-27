@echo off
setlocal

set "ROOT=%~dp0"

if "%~1"=="" (
  echo Uso:
  echo   simular.bat charts\minha-musica.json
  echo.
  echo Voce tambem pode arrastar um arquivo de chart em cima deste .bat.
  echo.
  echo Charts encontrados:
  dir /b "%ROOT%charts\*.json" "%ROOT%charts\*.js" 2>nul
  echo.
  pause
  exit /b 1
)

cd /d "%ROOT%"
node optimize-sp.js "%~1"

echo.
echo Saidas atualizadas em:
echo   output\summary.json
echo   output\sp-path.json
echo   output\grouped-notes.json
echo   output\special-phrases.json
echo.
pause
