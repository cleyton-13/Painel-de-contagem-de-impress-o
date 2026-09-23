@echo off
REM ============================================================
REM FIREWALL_HTTPS.bat - Painel de Impressoras BI
REM
REM Garante que as portas do painel estejam abertas no Firewall:
REM  - 3000 (TCP)  -> HTTP (agentes + dominio spx-hub.spximagem.com.br)
REM  - 3443 (TCP)  -> HTTPS interno (opcional)
REM Execute COMO ADMINISTRADOR no servidor.
REM ============================================================

pushd "%~dp0"

REM Remove regras antigas
netsh advfirewall firewall delete rule name="Painel BI 3000" >nul 2>&1
netsh advfirewall firewall delete rule name="Painel BI 3000 (HTTPS)" >nul 2>&1
netsh advfirewall firewall delete rule name="Painel BI 3443 (HTTPS)" >nul 2>&1

REM HTTP - porta 3000 (dominio/agentes)
netsh advfirewall firewall add rule name="Painel BI 3000 (HTTP)" dir=in action=allow protocol=TCP localport=3000 profile=any

REM HTTPS interno - porta 3443 (opcional)
netsh advfirewall firewall add rule name="Painel BI 3443 (HTTPS)" dir=in action=allow protocol=TCP localport=3443 profile=any

echo.
echo Regras do Firewall aplicadas:
echo  - 3000 TCP (HTTP)  -> http://spx-hub.spximagem.com.br:3000
echo  - 3443 TCP (HTTPS) -> acesso interno
echo.
netsh advfirewall firewall show rule name="Painel BI" verbose
pause