#Requires -Version 5.1
# ==============================================================================
# AGENTE DE PRODUCAO/HOMOLOGACAO - Envio de contadores via HTTP(S)
# Substitui o e-mail/Google Drive pelo envio direto ao servidor central.
#
# Uso: powershell -ExecutionPolicy Bypass -File enviar_homolog.ps1
#
# Configuracao: crie 'config.local.ps1' a partir de 'config.producao.ps1'
# (producao) ou 'config.homolog.ps1' (homologacao) e ajuste os valores.
#
# HTTPS: se $Servidor_Base comecar com https:// e $Confiar_Certificado=$true,
# o agente ignora a validacao do certificado (auto-assinado). Para confiar
# de verdade, instale o cert\painel.cer do servidor como Raiz Confiavel:
#   Import-Certificate -FilePath cert\painel.cer -CertStoreLocation Cert:\LocalMachine\Root
# ==============================================================================

$scriptPath = $PSScriptRoot
if (-not $scriptPath) { $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition }

$configFile = Join-Path -Path $scriptPath -ChildPath "config.local.ps1"
if (-not (Test-Path $configFile)) {
    Write-Host "Erro: crie 'config.local.ps1' a partir de 'config.producao.ps1' ou 'config.homolog.ps1'." -ForegroundColor Red
    exit 1
}
. $configFile

if (-not $Servidor_Base) { Write-Host "Erro: Servidor_Base nao definido." -ForegroundColor Red; exit 1 }
if (-not $ApiKey)        { Write-Host "Erro: ApiKey nao definida." -ForegroundColor Red; exit 1 }

$logFile = Join-Path -Path $scriptPath -ChildPath "agente.log"
function Write-Log([string]$msg, [string]$type="INFO") {
    $date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$date] [$type] $msg"
    if ($type -eq "ERRO" -or $type -eq "FALHA") {
        Write-Host $line -ForegroundColor Red
    } elseif ($type -eq "WARN" -or $type -eq "AVISO") {
        Write-Host $line -ForegroundColor Yellow
    } else {
        Write-Host $line -ForegroundColor Green
    }
    $line | Out-File -FilePath $logFile -Append -Encoding UTF8
}

Write-Log "Iniciando envio de homologacao..." "INFO"

# ---------------------------------------------------------------------------
# HTTPS: TLS 1.2+ e (opcional) aceitar certificado auto-assinado
# ---------------------------------------------------------------------------
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
if ($Servidor_Base -like "https://*" -and $Confiar_Certificado) {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
}

# ---------------------------------------------------------------------------
# ENVIO JSON COM RETRY AUTOMATICO (Compativel com PowerShell 5.1)
# ---------------------------------------------------------------------------
function Enviar-Leituras([object[]]$leituras) {
    $payload = @{ unidade = $Unidade; leituras = @($leituras) } | ConvertTo-Json -Depth 6
    $tentativas = 0
    $maxTentativas = 10
    $baseDelay = 5
    do {
        $tentativas++
        try {
            $resp = Invoke-RestMethod -Uri "$Servidor_Base$Endpoint_Ingestao" `
                -Method Post -ContentType "application/json; charset=utf-8" `
                -Headers @{ "x-api-key" = $ApiKey } -Body $payload -TimeoutSec 30
            if ($resp.success) {
                Write-Log "OK (tentativa $tentativas): unidade=$($resp.unidade) novas=$($resp.newReadings) atualizadas=$($resp.atualizadas) duplicadas=$($resp.duplicadas)" "INFO"
                try {
                    $dtAtual = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    "[$dtAtual] Envio confirmado com sucesso! Unidade=$($resp.unidade) | Novas=$($resp.newReadings) | Atualizadas=$($resp.atualizadas) | Duplicadas=$($resp.duplicadas)" | Set-Content -Path (Join-Path $scriptPath "ultimo_envio_sucesso.txt") -Encoding UTF8
                } catch {}
                return $true
            } else {
                Write-Log "Servidor retornou erros: $($resp.erros -join '; ')" "WARN"
                return $false
            }
        } catch {
            $msg = $_.Exception.Message
            if ($_.Exception.Response) {
                try {
                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    $respBody = $reader.ReadToEnd()
                    $msg += " - Resposta do Servidor: $respBody"
                } catch {}
            }
            Write-Log "Falha na tentativa ${tentativas}/${maxTentativas}: $msg" "WARN"
            if ($tentativas -lt $maxTentativas) {
                $delay = $baseDelay * [Math]::Pow(2, $tentativas - 1)
                Write-Log "Aguardando $delay segundos antes do proximo retry..." "WARN"
                Start-Sleep -Seconds $delay
            }
        }
    } while ($tentativas -lt $maxTentativas)
    Write-Log "ENVIO FALHOU APOS $maxTentativas TENTATIVAS" "ERRO"
    return $false
}

# ---------------------------------------------------------------------------
# 1) LER CSV LOCAL (se existir) e enviar (multipart ou JSON)
# ---------------------------------------------------------------------------
$csvDir = Join-Path -Path $scriptPath -ChildPath "relatorios"
$csvEncontrado = $null
if (Test-Path $csvDir) {
    $csvEncontrado = Get-ChildItem -Path $csvDir -Filter "*.csv" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if ($csvEncontrado) {
    Write-Log "Enviando CSV: $($csvEncontrado.Name)" "INFO"
    $linhas = Import-Csv -Path $csvEncontrado.FullName -Delimiter ";"
    $leituras = @()
    foreach ($l in $linhas) {
        $leituras += [PSCustomObject]@{
            ip            = [string]$l.IP
            serial        = [string]$l.Serial
            modelo        = [string]$l.Modelo
            dataHora      = [string]$l.Data
            paginasTotal  = [int64]([string]$l.Paginas_Total -replace '\.','')
            paginasPB     = [int64]([string]$l.Paginas_PB -replace '\.','')
            paginasColor  = [int64]([string]$l.Paginas_Color -replace '\.','')
            status        = [string]$l.Status
        }
    }
    Enviar-Leituras $leituras
} else {
    Write-Log "Nenhum CSV local em 'relatorios/'. Execute o monitor.ps1 original primeiro." "WARN"
}

Write-Log "Concluido." "INFO"
