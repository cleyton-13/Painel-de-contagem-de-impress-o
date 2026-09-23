@echo off
REM ============================================================
REM REMOVER_SERVICO.bat - Painel de Impressoras BI
REM
REM Remove o servico do Windows instalado por INSTALAR_SERVICO.bat.
REM Execute COMO ADMINISTRADOR no servidor.
REM ============================================================

echo Parando servico (se estiver em execucao)...
schtasks /End /TN "PainelBI" >nul 2>&1

echo Removendo servico...
schtasks /Delete /TN "PainelBI" /F >nul 2>&1

echo.
echo Servico removido. Para iniciar manualmente use INICIAR_PAINEL.bat
pause