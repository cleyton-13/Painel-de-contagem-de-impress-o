@echo off
REM ============================================================
REM ABRIR_PORTA_3000.bat
REM Abre a porta 3000 no Firewall do Windows para o Painel BI
REM EXECUTE COMO ADMINISTRADOR no servidor 192.168.68.162
REM ============================================================

echo Abrindo porta 3000 no Firewall do Windows...

REM Remove regra antiga se existir
netsh advfirewall firewall delete rule name="Painel BI - Node.js 3000" >nul 2>&1

REM Cria nova regra de entrada
netsh advfirewall firewall add rule ^
  name="Painel BI - Node.js 3000" ^
  dir=in ^
  action=allow ^
  protocol=TCP ^
  localport=3000 ^
  profile=any ^
  enable=yes

echo.
echo Regra adicionada com sucesso!
echo A porta 3000 agora esta liberada no firewall.
echo Acesse: http://192.168.68.162:3000
echo.
pause
