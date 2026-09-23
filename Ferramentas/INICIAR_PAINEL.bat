@echo off
REM ============================================================
REM INICIAR_PAINEL.bat - Painel de Impressoras BI (Ferramentas)
REM ============================================================

REM Forca a mudanca para o diretorio RAIZ do projeto (um nivel acima de Ferramentas)
pushd "%~dp0..\"
echo Diretorio atual: %CD%
echo.

REM --- 1. Encerrar Node existente ---
echo [1/5] Encerrando processos node.exe...
taskkill /F /IM node.exe >nul 2>&1
REM Pausa para garantir que as portas 3000/3443 sejam liberadas
timeout /t 2 /nobreak >nul

REM --- 2. Dependencias ---
echo [2/5] Verificando dependencias...
if not exist "node_modules\" (
    echo Instalando pacotes...
    call npm install
)

REM --- 3. Certificado HTTPS ---
echo [3/5] Verificando certificado HTTPS...
if not exist "cert\painel.pfx" (
    if not exist "cert\fullchain.pem" (
        echo Sem certificado - o HTTPS interno (3443) ficara desativado.
    )
)

REM --- 4. Build ---
echo [4/5] Verificando build do Next.js...
if not exist ".next\BUILD_ID" (
    echo Compilando projeto...
    call npm run build
) else (
    echo Build ja existente. Pulando compilacao...
)

REM --- 5. Iniciar servidor ---
echo [5/5] Iniciando servidor web...
echo.
echo    Painel disponivel em:
echo    HTTP : http://spx-hub.spximagem.com.br:3000
echo    HTTPS: https://192.168.68.162:3443
echo.
echo    Pressione Ctrl+C para encerrar o servidor.
echo.
node server.js

pause
