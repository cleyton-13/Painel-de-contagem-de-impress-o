#Requires -RunAsAdministrator
# ============================================================
# INSTALAR_SERVICO_ROBUSTO.ps1 - Painel de Impressoras BI
#
# Execute COMO ADMINISTRADOR no proprio servidor (192.168.68.162)
# Funciona com caminho local OU de rede - descobre automaticamente.
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Instalador de Servico - Painel de Impressoras BI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Descobrir o caminho local do projeto ──────────────────
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptDir = (Get-Item (Join-Path $toolDir "..")).FullName
Write-Host "[1/5] Pasta do projeto: $scriptDir" -ForegroundColor Yellow

# ── 2. Verificar build ────────────────────────────────────────
Write-Host "[2/5] Verificando build..." -ForegroundColor Yellow
$buildId = Join-Path $scriptDir ".next\BUILD_ID"
if (-not (Test-Path $buildId)) {
    Write-Host "  ERRO: Build nao encontrado (.next\BUILD_ID ausente)." -ForegroundColor Red
    Write-Host "  Execute INICIAR_PAINEL.bat uma vez antes de instalar o servico." -ForegroundColor Red
    Read-Host "  Pressione ENTER para sair"
    exit 1
}
Write-Host "  OK - Build encontrado." -ForegroundColor Green

# ── 3. Descobrir node.exe ─────────────────────────────────────
Write-Host "[3/5] Localizando node.exe..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  ERRO: node.exe nao encontrado no PATH." -ForegroundColor Red
    Read-Host "  Pressione ENTER para sair"
    exit 1
}
$node = $nodeCmd.Source
Write-Host "  OK - $node" -ForegroundColor Green

# ── 4. Remover tarefa/servico antigo ─────────────────────────
Write-Host "[4/5] Removendo configuracao antiga (se existir)..." -ForegroundColor Yellow
schtasks /Delete /TN "PainelBI" /F 2>$null | Out-Null
$sc = Get-Service -Name "PainelBI" -ErrorAction SilentlyContinue
if ($sc) {
    Stop-Service "PainelBI" -Force -ErrorAction SilentlyContinue
    sc.exe delete "PainelBI" | Out-Null
}
Write-Host "  OK." -ForegroundColor Green

# ── 5. Criar servico Windows nativo ───────────────────────────
Write-Host "[5/5] Criando servico Windows..." -ForegroundColor Yellow

$serverJs = Join-Path $scriptDir "server.js"
$binPath   = "`"$node`" `"$serverJs`""
$logsDir   = Join-Path $scriptDir "Logs_do_servidor"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
$logFile   = Join-Path $logsDir "server-service.log"

# Criar o servico via sc.exe
$result = sc.exe create "PainelBI" binPath= "cmd.exe /c `"$node`" `"$serverJs`" >> `"$logFile`" 2>&1" start= auto DisplayName= "Painel de Impressoras BI"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  sc.exe create falhou. Tentando via Agendador de Tarefas..." -ForegroundColor Yellow
    
    # Fallback: Agendador com caminho local
    $action  = New-ScheduledTaskAction -Execute $node -Argument "`"$serverJs`"" -WorkingDirectory $scriptDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask `
        -TaskName "PainelBI" `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host "  OK - Tarefa criada no Agendador." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Iniciando agora..." -ForegroundColor Yellow
    schtasks /Run /TN "PainelBI"
} else {
    Write-Host "  OK - Servico Windows criado." -ForegroundColor Green
    
    # Configurar recuperacao automatica em caso de falha
    sc.exe failure "PainelBI" reset= 60 actions= restart/5000/restart/10000/restart/30000 | Out-Null
    
    Write-Host "  Iniciando servico..." -ForegroundColor Yellow
    Start-Service "PainelBI" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $svc = Get-Service "PainelBI" -ErrorAction SilentlyContinue
    if ($svc.Status -eq "Running") {
        Write-Host "  OK - Servico em execucao!" -ForegroundColor Green
    } else {
        Write-Host "  AVISO: Servico criado mas nao iniciou automaticamente." -ForegroundColor Yellow
        Write-Host "  Tente: Start-Service PainelBI" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Configuracao concluida!" -ForegroundColor Green
Write-Host ""
Write-Host "  Acesse: http://192.168.68.162:3000" -ForegroundColor White
Write-Host "          http://spx-hub.spximagem.com.br:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Para verificar status: Get-Service PainelBI" -ForegroundColor Gray
Write-Host "  Para ver logs:         $logFile" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Pressione ENTER para fechar"
