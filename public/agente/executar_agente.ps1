# ==============================================================================
# EXECUTOR DO AGENTE (LEGADO PS1) - Coleta SNMP + Envio HTTP + Auto-Update
# Otimizado para execucao agendada, boot e logons
# ==============================================================================
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptPath = $PSScriptRoot
if (-not $ScriptPath) { $ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition }

$logFile = Join-Path $ScriptPath "agente.log"
function Log-Exec([string]$msg) {
    $d = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    # Rotaciona log acima de 5 MB
    if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 5MB)) {
        Move-Item -Path $logFile -Destination "$logFile.old" -Force -ErrorAction SilentlyContinue
    }
    "[$d] [EXEC] $msg" | Out-File -FilePath $logFile -Append -Encoding UTF8
    Write-Host "[$d] $msg"
}

Log-Exec "Iniciando ciclo de execucao do agente..."

# 1. Aguarda a rede local estar ativa (ate 30s) para suportar disparos no logon/boot
$redePronta = $false
for ($i = 1; $i -le 6; $i++) {
    $ipOk = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias * -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*"
    }
    if ($ipOk) {
        $redePronta = $true
        break
    }
    Start-Sleep -Seconds 5
}

if (-not $redePronta) {
    Log-Exec "Aviso: Nenhuma interface IPv4 com IP valido detectada apos 30s. Tentando prosseguir..."
}

# 2. AUTO-UPDATE: Consulta o servidor central por novas versoes dos scripts .ps1
$configFile = Join-Path $ScriptPath "config.local.ps1"
if (Test-Path $configFile) {
    . $configFile
    if ($Servidor_Base) {
        try {
            $srvBase = $Servidor_Base.TrimEnd("/")
            $headers = @{}
            if ($ApiKey) {
                $headers["x-api-key"] = $ApiKey
                $headers["Authorization"] = "Bearer $ApiKey"
            }

            Log-Exec "Verificando se ha atualizacoes em $srvBase/api/agente/versao..."
            $verResp = Invoke-RestMethod -Uri "$srvBase/api/agente/versao" -Headers $headers -Method Get -TimeoutSec 8 -ErrorAction Stop
            if ($verResp -and $verResp.arquivos) {
                $arquivos = $verResp.arquivos
                # Atualiza scripts .ps1 auxiliares primeiro e executar_agente.ps1 por ultimo; ignora binarios .exe
                $nomesPs1 = @($arquivos.psobject.properties.Name | Where-Object { $_.EndsWith(".ps1") -and $_ -ne "executar_agente.ps1" })
                if ($arquivos.psobject.properties.Name -contains "executar_agente.ps1") {
                    $nomesPs1 += "executar_agente.ps1"
                }

                foreach ($nome in $nomesPs1) {
                    $info = $arquivos.$nome
                    $hashRemoto = $info.sha256
                    if (-not $hashRemoto) { continue }
                    $destLocal = Join-Path $ScriptPath $nome

                    $precisaBaixar = $false
                    if (-not (Test-Path $destLocal)) {
                        $precisaBaixar = $true
                    } else {
                        $hashLocal = (Get-FileHash -Path $destLocal -Algorithm SHA256).Hash.ToLower()
                        if ($hashLocal -ne $hashRemoto.ToLower()) {
                            $precisaBaixar = $true
                        }
                    }

                    if ($precisaBaixar) {
                        Log-Exec "Atualizando script: $nome (hash remoto: $($hashRemoto.Substring(0,8))...)"
                        $tmpFile = "$destLocal.tmp"
                        $urlDown = "$srvBase/api/agente/download?arquivo=$nome"
                        Invoke-WebRequest -Uri $urlDown -Headers $headers -OutFile $tmpFile -TimeoutSec 30 -UseBasicParsing
                        if (Test-Path $tmpFile) {
                            $hashTmp = (Get-FileHash -Path $tmpFile -Algorithm SHA256).Hash.ToLower()
                            if ($hashTmp -eq $hashRemoto.ToLower()) {
                                Move-Item -Path $tmpFile -Destination $destLocal -Force
                                Log-Exec "Script $nome atualizado com sucesso!"
                            } else {
                                Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
                                Log-Exec "Aviso: Hash incorreto ao baixar $nome. Mantendo versao anterior."
                            }
                        }
                    }
                }
            }
        } catch {
            Log-Exec "Auto-update indisponivel neste ciclo ($($_.Exception.Message)). Prosseguindo com versao local."
        }
    }
}

# 3. Executa a coleta SNMP
Log-Exec "Iniciando monitor (Coleta SNMP com wake-up)..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$ScriptPath\monitor.ps1"

# 4. Executa o envio HTTP
$envioScript = "enviar_homolog.ps1"
if (Test-Path "$ScriptPath\enviar_producao.ps1") {
    $envioScript = "enviar_producao.ps1"
}
Log-Exec "Iniciando envio (HTTP Post com retry) usando $envioScript..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$ScriptPath\$envioScript"

Log-Exec "Ciclo de execucao finalizado com sucesso."
