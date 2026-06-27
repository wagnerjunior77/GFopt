@echo off
setlocal

set "ROOT=%~dp0"

if "%~1"=="" (
  echo Uso:
  echo   visualizar.bat charts\minha-musica.json
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
node render-path.js "%~1"

if errorlevel 1 (
  echo.
  echo Falha ao gerar a visualizacao.
  pause
  exit /b 1
)

echo.
echo Visualizacao atualizada em:
echo   output\%~n1\path.svg
echo   output\%~n1\path.png
echo.
start "" "%ROOT%output\%~n1\path.png"
pause
