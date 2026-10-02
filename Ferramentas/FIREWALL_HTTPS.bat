@echo off
REM ============================================================
REM FIREWALL_HTTPS.bat v2 - abre portas 3000 e 3443 no Firewall
REM Execute COMO ADMINISTRADOR.
REM ============================================================

echo Removendo regras antigas...
netsh advfirewall firewall delete rule name="Painel BI 3000" >nul 2>&1
netsh advfirewall firewall delete rule name="Painel BI 3000 (HTTPS)" >nul 2>&1
netsh advfirewall firewall delete rule name="Painel BI 3443 (HTTPS)" >nul 2>&1

echo Criando regra HTTP (porta 3000)...
netsh advfirewall firewall add rule name="Painel BI 3000 (HTTP)" dir=in action=allow protocol=TCP localport=3000 profile=any

echo Criando regra HTTPS (porta 3443)...
netsh advfirewall firewall add rule name="Painel BI 3443 (HTTPS)" dir=in action=allow protocol=TCP localport=3443 profile=any

echo.
echo Regras do Firewall aplicadas com sucesso:
echo   - 3000 TCP (HTTP)  -> http://192.168.68.162:3000
echo   - 3443 TCP (HTTPS) -> acesso interno
echo.

netsh advfirewall firewall show rule name all dir=in profile=any
pause