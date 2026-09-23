@echo off
REM ============================================================
REM INSTALAR_SERVICO.bat - Painel de Impressoras BI (Ferramentas)
REM Execute COMO ADMINISTRADOR no proprio servidor
REM ============================================================

REM Descobre o diretorio pai (a raiz do projeto) dinamicamente
set "PROJECT_PATH=%~dp0.."
for %%i in ("%PROJECT_PATH%") do set "PROJECT_PATH=%%~fi"

set "LOGFILE=%PROJECT_PATH%\Logs_do_servidor\instalar_servico.log"
if not exist "%PROJECT_PATH%\Logs_do_servidor" mkdir "%PROJECT_PATH%\Logs_do_servidor"

echo [%DATE% %TIME%] Iniciando instalacao... > "%LOGFILE%"
echo Caminho raiz do projeto: %PROJECT_PATH%
echo [%DATE% %TIME%] Caminho raiz: %PROJECT_PATH% >> "%LOGFILE%"

REM Verificar build
if not exist "%PROJECT_PATH%\.next\BUILD_ID" (
    echo [%DATE% %TIME%] ERRO: Build nao encontrado. >> "%LOGFILE%"
    echo.
    echo ERRO: Build nao encontrado. Execute INICIAR_PAINEL.bat uma vez antes de instalar o servico.
    echo.
    pause
    exit /b 1
)

REM Executar o instalador PowerShell que agora esta na mesma pasta (Ferramentas)
set "PS_SCRIPT=%~dp0INSTALAR_SERVICO_ROBUSTO.ps1"
echo [%DATE% %TIME%] Chamando %PS_SCRIPT% >> "%LOGFILE%"
powershell -ExecutionPolicy Bypass -File "%PS_SCRIPT%" >> "%LOGFILE%" 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ATENCAO: O script PowerShell retornou um erro. Veja o log:
    echo %LOGFILE%
) else (
    echo.
    echo Instalacao concluida com sucesso! O servico PainelBI foi criado/reiniciado.
)

echo.
pause