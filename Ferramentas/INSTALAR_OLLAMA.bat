@echo off
color 0B
echo =========================================================
echo       INSTALADOR DO OLLAMA E MODELO LLAMA 3.1
echo =========================================================
echo.
echo [1/3] Baixando o instalador do Ollama (aprox. 230 MB)...
echo Vai aparecer uma barrinha de progresso estilo PowerShell:
echo.
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile 'OllamaSetup.exe'"

echo.
echo [2/3] Instalando o Ollama no servidor...
OllamaSetup.exe /SILENT
echo Instalacao concluida! Aguardando o servico iniciar...
timeout /t 5 >nul

echo.
echo [3/3] Baixando a Inteligencia Artificial Llama 3.1 (4.7 GB)
echo ISSO PODE DEMORAR BASTANTE (15 a 40 minutos dependendo da rede).
echo Acompanhe o progresso detalhado na barra abaixo:
echo.
set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if exist "%OLLAMA_EXE%" (
    "%OLLAMA_EXE%" pull llama3.1
) else (
    ollama pull llama3.1
)

echo.
echo =========================================================
echo PARABENS! O Ollama e o Llama 3.1 estao instalados!
echo O erro "fetch failed" vai desaparecer agora.
echo =========================================================
pause
