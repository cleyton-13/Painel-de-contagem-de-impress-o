#Requires -Version 5.1
# ==============================================================================
# MONITOR SNMP - Geracao do Relatorio de Impressoras (CSV)
# Otimizado com retry de wake-up, fallback de OIDs e cache de serial
# ==============================================================================

$scriptPath = $PSScriptRoot
if (-not $scriptPath) { $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition }

$configFile = Join-Path -Path $scriptPath -ChildPath "config.local.ps1"
if (-not (Test-Path $configFile)) {
    Write-Host "Erro: Arquivo config.local.ps1 nao encontrado." -ForegroundColor Red
    exit 1
}
. $configFile

$impsFile = Join-Path -Path $scriptPath -ChildPath "impressoras.txt"
if (-not (Test-Path $impsFile)) {
    Write-Host "Erro: Arquivo impressoras.txt nao encontrado." -ForegroundColor Red
    exit 1
}

$ips = @(Get-Content $impsFile | Where-Object { $_.Trim() -ne "" })
if ($ips.Count -eq 0) {
    Write-Host "Nenhuma impressora no arquivo impressoras.txt" -ForegroundColor Yellow
    exit 0
}

$relatoriosDir = Join-Path -Path $scriptPath -ChildPath "relatorios"
if (-not (Test-Path $relatoriosDir)) {
    New-Item -ItemType Directory -Path $relatoriosDir | Out-Null
}

# Carregar cache de seriais e modelos do ultimo CSV valido em relatorios (se existir)
$cacheSeriais = @{}
$cacheModelos = @{}
try {
    $ultimoCsv = Get-ChildItem -Path $relatoriosDir -Filter "*.csv" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($ultimoCsv) {
        $linhasAntigas = Import-Csv -Path $ultimoCsv.FullName -Delimiter ";"
        foreach ($la in $linhasAntigas) {
            if ($la.IP -and $la.Serial -and $la.Serial -ne "N/A") {
                $cacheSeriais[$la.IP.Trim()] = $la.Serial.Trim()
            }
            if ($la.IP -and $la.Modelo -and $la.Modelo -ne "N/A") {
                $cacheModelos[$la.IP.Trim()] = $la.Modelo.Trim()
            }
        }
    }
} catch {}

$resultados = @()

foreach ($ipRaw in $ips) {
    $ip = $ipRaw.Trim()
    $dataAtual = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    $modelo = "N/A"
    $serial = "N/A"
    $total = "0"
    $pb = "0"
    $color = "0"
    $status = "Offline"
    
    Write-Host "Consultando IP: $ip ... " -NoNewline
    
    # 1. Ping com retry para acordar impressoras em modo sleep / suspensao profunda
    $pingOnline = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $ping = ping -n 1 -w 1500 $ip
        if ($ping -match "TTL=") {
            $pingOnline = $true
            break
        }
        if ($attempt -lt 3) { Start-Sleep -Milliseconds 500 }
    }
    
    if ($pingOnline) {
        $status = "Online"
        $snmpSucesso = $false
        $timeoutToUse = if ($SNMP_Timeout) { $SNMP_Timeout } else { 3000 }
        $commToUse = if ($SNMP_Community) { $SNMP_Community } else { "public" }

        # 2. SNMP com retry (para impressoras cujo controlador SNMP demora a responder)
        for ($sTry = 1; $sTry -le 2; $sTry++) {
            try {
                $snmp = New-Object -ComObject "OlePrn.OleSNMP"
                $snmp.Open($ip, $commToUse, 2, $timeoutToUse)
                
                # Leitura do Modelo (com fallback sysDescr / hrDeviceDescr)
                try { 
                    $modelo = $snmp.Get($OID_Modelo).ToString() 
                } catch {
                    try { $modelo = $snmp.Get(".1.3.6.1.2.1.25.3.2.1.3.1").ToString() } catch {
                        try { $modelo = $snmp.Get(".1.3.6.1.2.1.1.1.0").ToString() } catch {}
                    }
                }
                
                # Leitura do Serial (com fallback RFC standard e Brother)
                try { 
                    $serial = $snmp.Get($OID_Serial).ToString() 
                } catch { 
                    try { $serial = $snmp.Get(".1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0").ToString() } catch {
                        try { $serial = $snmp.Get(".1.3.6.1.2.1.43.5.1.1.17.1").ToString() } catch {}
                    }
                }
                
                # Leitura de Paginas Total
                try { 
                    $total = $snmp.Get($OID_Paginas).ToString() 
                } catch { 
                    try { $total = $snmp.Get(".1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.10.0").ToString() } catch { 
                        try { $total = $snmp.Get(".1.3.6.1.2.1.43.10.2.1.4.1.2").ToString() } catch {}
                    }
                }
                
                # Leitura de Paginas PB e Color
                try { $pb = $snmp.Get($OID_Paginas_PB).ToString() } catch {}
                try { $color = $snmp.Get($OID_Paginas_Color).ToString() } catch {}
                
                $snmp.Close()
                
                # Se conseguiu ler ao menos modelo ou contadores
                if (($modelo -and $modelo -ne "N/A") -or ($total -and $total -ne "0") -or ($pb -and $pb -ne "0")) {
                    $snmpSucesso = $true
                    Write-Host "[OK]" -ForegroundColor Green
                    break
                }
            } catch {
                if ($sTry -lt 2) { Start-Sleep -Milliseconds 800 }
            }
        }
        
        # 3. Fallback de cache se o SNMP oscilou mas a impressora esta online
        if ([string]::IsNullOrWhiteSpace($serial) -or $serial -eq "N/A") {
            if ($cacheSeriais.ContainsKey($ip)) {
                $serial = $cacheSeriais[$ip]
            }
        }
        if ([string]::IsNullOrWhiteSpace($modelo) -or $modelo -eq "N/A") {
            if ($cacheModelos.ContainsKey($ip)) {
                $modelo = $cacheModelos[$ip]
            }
        }

        if (-not $snmpSucesso) {
            Write-Host "[FALHA SNMP]" -ForegroundColor Yellow
            $status = "Erro SNMP"
        }
    } else {
        Write-Host "[OFFLINE]" -ForegroundColor Red
        # Preserva serial e modelo conhecidos mesmo offline para rastreabilidade no painel
        if ($cacheSeriais.ContainsKey($ip)) { $serial = $cacheSeriais[$ip] }
        if ($cacheModelos.ContainsKey($ip)) { $modelo = $cacheModelos[$ip] }
    }
    
    $resultados += [PSCustomObject]@{
        IP = $ip
        Serial = if ($serial) { $serial } else { "N/A" }
        Modelo = if ($modelo) { $modelo } else { "N/A" }
        Data = $dataAtual
        Paginas_Total = if ($total) { $total } else { "0" }
        Paginas_PB = if ($pb) { $pb } else { "0" }
        Paginas_Color = if ($color) { $color } else { "0" }
        Status = $status
    }
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$csvName = "relatorio_${Unidade}_${timestamp}.csv"
$csvPath = Join-Path -Path $relatoriosDir -ChildPath $csvName

$resultados | Export-Csv -Path $csvPath -Delimiter ";" -NoTypeInformation -Encoding UTF8
Write-Host "Relatorio salvo com sucesso em: $csvPath" -ForegroundColor Cyan
