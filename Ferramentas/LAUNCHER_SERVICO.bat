@echo off
REM ============================================================
REM LAUNCHER_SERVICO.bat - Iniciado automaticamente pelo Agendador de Tarefas
REM NÃO execute diretamente. Use INSTALAR_SERVICO.bat para instalar
REM e INICIAR_PAINEL.bat para iniciar manualmente.
REM ============================================================
pushd "\\192.168.68.162\DESENVOLVIMENTO\Painel de impressoras BI\Saida"
node server.js
popd
