@echo off
echo ========================================
echo   OZN PAY - INICIANDO SERVIDOR
echo ========================================
echo.

node --version
if %errorlevel% neq 0 (
    echo.
    echo -------------------------------------------------------------------
    echo ERRO: Node.js nao encontrado!
    echo Voce precisa instalar o Node.js para o servidor funcionar.
    echo.
    echo Baixe aqui: https://nodejs.org
    echo -------------------------------------------------------------------
    echo.
    pause
    exit
)

echo.
echo Testando dependencias...
if not exist "node_modules\" (
    echo Instalando dependencias (isso pode demorar um pouco)...
    call npm install
)

echo.
echo Iniciando o servidor...
echo.
node server.js

echo.
echo O servidor parou inesperadamente.
pause
