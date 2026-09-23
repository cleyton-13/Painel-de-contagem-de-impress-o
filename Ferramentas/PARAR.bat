@echo off
echo Encerrando processos node.exe existentes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel%==0 (
    echo     OK.
) else (
    echo     Nenhum processo node encontrado.
)
echo.
pause
