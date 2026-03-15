@echo off
cls
color 0A
echo ===================================================
echo       OZN PAY - SISTEMA DE INICIALIZACAO
echo ===================================================
echo.

:: 1. Verificar Node.js
echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO CRITICO] NODE.JS NAO ENCONTRADO!
    echo.
    echo O OZN PAY precisa do Node.js para o banco de dados e notificacoes.
    echo.
    echo 1. Baixe o Node.js: https://nodejs.org
    echo 2. Instale (clique em "Next" ate o fim)
    echo 3. Reinicie este programa
    echo.
    pause
    exit
)
echo    OK! Node.js detectado.
echo.

:: 2. Verificar Dependencias
echo [2/4] Verificando dependencias do sistema...
if not exist "node_modules\" (
    echo    Instalando bibliotecas (pode demorar 1 minuto)...
    call npm install --loglevel=error
) else (
    echo    Bibliotecas ja instaladas.
)
echo.

:: 3. IP Local
echo [3/4] Identificando IP para acesso mobile...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    set IP=%%a
)
set IP=%IP: =%
echo    Seu IP Local: %IP%
echo.

:: 4. Iniciar Servidor
echo [4/4] Iniciando Servidor OZN PAY...
echo.
echo ===================================================
echo    STATUS: ONLINE
echo ===================================================
echo.
echo    Computador: http://localhost:3000
echo    Celular:    http://%IP%:3000
echo.
echo    [DICA] Mantenha esta janela aberta para o sistema funcionar.
echo ===================================================
echo.

node server.js
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] O servidor parou. Verifique se ja nao tem outro aberto.
    pause
)
