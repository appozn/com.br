@echo off
echo ========================================
echo     OZN PAY - Servidor Local
echo ========================================
echo.
echo Iniciando servidor HTTP na porta 8080...
echo.
echo Acesse no seu celular:
echo http://%COMPUTERNAME%.local:8080
echo ou
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        echo http://%%b:8080
    )
)
echo.
echo Pressione Ctrl+C para parar o servidor
echo ========================================
echo.

python -m http.server 8080 2>nul
if errorlevel 1 (
    echo Python nao encontrado. Tentando Node.js...
    npx -y http-server -p 8080
    if errorlevel 1 (
        echo.
        echo ERRO: Nem Python nem Node.js foram encontrados.
        echo Instale um deles para rodar o servidor:
        echo - Python: https://python.org
        echo - Node.js: https://nodejs.org
        pause
    )
)
