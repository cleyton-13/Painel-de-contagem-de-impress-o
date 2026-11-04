#Requires -Version 5.1
# ==============================================================================
# GESTAO DO AGENTE DE HOMOLOGACAO - Configuracao + Testes de Conexao + Envio
# Mesmo padrao do GestaoImpressoras.ps1 (Windows Forms), adaptado ao fluxo HTTP
# ==============================================================================
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ImpFile   = Join-Path $ScriptDir "impressoras.txt"
$ConfFile  = Join-Path $ScriptDir "config.local.ps1"

# ── Defaults ──────────────────────────────────────────────────────
$Unidade = "AE_PERUS"
$Servidor_Base = "http://localhost:3001"
$Endpoint_Ingestao = "/api/ingestao/teste"
$ApiKey = "homolog2026"
$SNMP_Community = "public"
$SNMP_Timeout = 3000
$OID_Modelo = ".1.3.6.1.2.1.1.1.0"
$OID_Serial = ".1.3.6.1.2.1.43.5.1.1.17.1"
$OID_Paginas = ".1.3.6.1.2.1.43.10.2.1.4.1.1"
$OID_Paginas_Color = ".1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.2.2"
$OID_Paginas_PB = ".1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.1.2"

if (Test-Path $ConfFile) {
    try { . $ConfFile } catch {}
}
if (-not $Servidor_Base) { $Servidor_Base = "http://localhost:3001" }
if (-not $Endpoint_Ingestao) { $Endpoint_Ingestao = "/api/ingestao/teste" }

function CarregarImpressoras {
    if (Test-Path $ImpFile) {
        return @(Get-Content $ImpFile | Where-Object { $_.Trim() -ne "" })
    }
    return @()
}

function SalvarImpressoras($list) {
    $list | Out-File -FilePath $ImpFile -Encoding UTF8
}

function Append-Log($txtLog, $msg) {
    $txtLog.AppendText("$msg`r`n")
    $txtLog.SelectionStart = $txtLog.TextLength
    $txtLog.ScrollToCaret()
}

# ── Formulario principal ─────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = "Agente de Homologacao - Gestao (Envio HTTP)"
$form.Size = New-Object System.Drawing.Size(800, 620)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Size = New-Object System.Drawing.Size(780, 560)
$tabs.Location = New-Object System.Drawing.Point(10, 10)
$tabs.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)

# ── Aba 1: Impressoras ───────────────────────────────────────────
$tabImp = New-Object System.Windows.Forms.TabPage
$tabImp.Text = " Impressoras "
$tabImp.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$lblImp = New-Object System.Windows.Forms.Label
$lblImp.Text = "IPs das impressoras (um por linha):"
$lblImp.Location = New-Object System.Drawing.Point(10, 15)
$lblImp.Size = New-Object System.Drawing.Size(400, 20)

$txtImpressoras = New-Object System.Windows.Forms.TextBox
$txtImpressoras.Multiline = $true
$txtImpressoras.Location = New-Object System.Drawing.Point(10, 40)
$txtImpressoras.Size = New-Object System.Drawing.Size(450, 300)
$txtImpressoras.ScrollBars = "Both"
$txtImpressoras.Font = New-Object System.Drawing.Font("Consolas", 10)
$txtImpressoras.Text = [string]::Join([Environment]::NewLine, (CarregarImpressoras))

$btnSalvarImp = New-Object System.Windows.Forms.Button
$btnSalvarImp.Text = "Salvar"
$btnSalvarImp.Location = New-Object System.Drawing.Point(10, 350)
$btnSalvarImp.Size = New-Object System.Drawing.Size(110, 35)
$btnSalvarImp.BackColor = [System.Drawing.Color]::DodgerBlue
$btnSalvarImp.ForeColor = [System.Drawing.Color]::White
$btnSalvarImp.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnSalvarImp.Add_Click({
    $ips = $txtImpressoras.Text -split "`r`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    SalvarImpressoras $ips
    [System.Windows.Forms.MessageBox]::Show("Impressoras salvas com sucesso!", "Sucesso", "OK", "Information")
})

$btnTestarSel = New-Object System.Windows.Forms.Button
$btnTestarSel.Text = "Testar Selecionada (Ping)"
$btnTestarSel.Location = New-Object System.Drawing.Point(130, 350)
$btnTestarSel.Size = New-Object System.Drawing.Size(160, 35)
$btnTestarSel.Add_Click({
    $linhas = $txtImpressoras.Lines
    if ($linhas.Count -gt 0 -and $linhas[0].Trim() -ne "") {
        $ip = $linhas[0].Trim()
        $result = ping -n 1 -w 1000 $ip
        if ($result -match "TTL=") {
            [System.Windows.Forms.MessageBox]::Show("$ip - Ping OK!", "Teste", "OK", "Information")
        } else {
            [System.Windows.Forms.MessageBox]::Show("$ip - Sem resposta ao ping.", "Falha", "OK", "Warning")
        }
    }
})

$pnlAtalhos = New-Object System.Windows.Forms.GroupBox
$pnlAtalhos.Text = "Atalhos"
$pnlAtalhos.Location = New-Object System.Drawing.Point(480, 20)
$pnlAtalhos.Size = New-Object System.Drawing.Size(250, 150)

$btnAbrirCSV = New-Object System.Windows.Forms.Button
$btnAbrirCSV.Text = "Abrir Pasta Relatorios"
$btnAbrirCSV.Location = New-Object System.Drawing.Point(15, 25)
$btnAbrirCSV.Size = New-Object System.Drawing.Size(220, 32)
$btnAbrirCSV.Add_Click({
    $dir = Join-Path $ScriptDir "relatorios"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Start-Process $dir
})

$btnAbrirConfig = New-Object System.Windows.Forms.Button
$btnAbrirConfig.Text = "Abrir config.local.ps1"
$btnAbrirConfig.Location = New-Object System.Drawing.Point(15, 62)
$btnAbrirConfig.Size = New-Object System.Drawing.Size(220, 32)
$btnAbrirConfig.Add_Click({ if (Test-Path $ConfFile) { notepad $ConfFile } })

$btnAbrirPasta = New-Object System.Windows.Forms.Button
$btnAbrirPasta.Text = "Abrir Pasta do Agente"
$btnAbrirPasta.Location = New-Object System.Drawing.Point(15, 99)
$btnAbrirPasta.Size = New-Object System.Drawing.Size(220, 32)
$btnAbrirPasta.Add_Click({ Start-Process $ScriptDir })

$tabImp.Controls.AddRange(@($lblImp, $txtImpressoras, $btnSalvarImp, $btnTestarSel, $pnlAtalhos))
$pnlAtalhos.Controls.AddRange(@($btnAbrirCSV, $btnAbrirConfig, $btnAbrirPasta))

# ── Aba 2: Configuracao ──────────────────────────────────────────
$tabConf = New-Object System.Windows.Forms.TabPage
$tabConf.Text = " Configuracao "
$tabConf.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$labels_conf = @(
    "Unidade:",
    "Servidor (URL base):",
    "Endpoint de ingestao:",
    "API Key:",
    "Confiar certificado (true/false):",
    "Enviar multipart/CSV (true/false):",
    "Community SNMP:",
    "Timeout SNMP (ms):",
    "OID Modelo:",
    "OID Serial:",
    "OID Paginas Total:",
    "OID Paginas Color:",
    "OID Paginas PB:"
)
$props_conf = @(
    "Unidade", "Servidor_Base", "Endpoint_Ingestao", "ApiKey",
    "Confiar_Certificado", "Enviar_Multipart",
    "SNMP_Community", "SNMP_Timeout", "OID_Modelo", "OID_Serial",
    "OID_Paginas", "OID_Paginas_Color", "OID_Paginas_PB"
)
$vals_conf = @(
    $Unidade, $Servidor_Base, $Endpoint_Ingestao, $ApiKey,
    $Confiar_Certificado, $Enviar_Multipart,
    $SNMP_Community, $SNMP_Timeout, $OID_Modelo, $OID_Serial,
    $OID_Paginas, $OID_Paginas_Color, $OID_Paginas_PB
)

$txtConf = @{}
$y = 15
for ($i = 0; $i -lt $labels_conf.Count; $i++) {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $labels_conf[$i]
    $lbl.Location = New-Object System.Drawing.Point(20, $y)
    $lbl.Size = New-Object System.Drawing.Size(180, 24)

    $txt = New-Object System.Windows.Forms.TextBox
    $txt.Location = New-Object System.Drawing.Point(200, $y)
    $txt.Size = New-Object System.Drawing.Size(520, 24)
    $txt.Text = [string]$vals_conf[$i]
    if ($props_conf[$i] -eq "ApiKey") { $txt.UseSystemPasswordChar = $true }

    $txtConf[$props_conf[$i]] = $txt
    $tabConf.Controls.Add($lbl)
    $tabConf.Controls.Add($txt)
    $y += 30
}

$btnSalvarConf = New-Object System.Windows.Forms.Button
$btnSalvarConf.Text = "Salvar Configuracao"
$btnSalvarConf.Location = New-Object System.Drawing.Point(200, ($y + 5))
$btnSalvarConf.Size = New-Object System.Drawing.Size(240, 40)
$btnSalvarConf.BackColor = [System.Drawing.Color]::DodgerBlue
$btnSalvarConf.ForeColor = [System.Drawing.Color]::White
$btnSalvarConf.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnSalvarConf.Add_Click({
    # Normaliza booleanos: aceita true/false/$true/$false e grava sempre $true/$false
    $confiarRaw = $txtConf['Confiar_Certificado'].Text.Trim().TrimStart('$').ToLower()
    if ($confiarRaw -notin @('true','false')) { $confiarRaw = 'false' }
    $multipartRaw = $txtConf['Enviar_Multipart'].Text.Trim().TrimStart('$').ToLower()
    if ($multipartRaw -notin @('true','false')) { $multipartRaw = 'true' }

    $content = @"
`$Unidade         = "$($txtConf['Unidade'].Text)"
`$Servidor_Base   = "$($txtConf['Servidor_Base'].Text)"
`$Endpoint_Ingestao = "$($txtConf['Endpoint_Ingestao'].Text)"
`$ApiKey          = "$($txtConf['ApiKey'].Text)"

`$Confiar_Certificado = `$$confiarRaw
`$Enviar_Multipart    = `$$multipartRaw

`$SNMP_Community  = "$($txtConf['SNMP_Community'].Text)"
`$SNMP_Timeout    = $($txtConf['SNMP_Timeout'].Text)

`$OID_Modelo        = "$($txtConf['OID_Modelo'].Text)"
`$OID_Serial        = "$($txtConf['OID_Serial'].Text)"
`$OID_Paginas       = "$($txtConf['OID_Paginas'].Text)"
`$OID_Paginas_Color = "$($txtConf['OID_Paginas_Color'].Text)"
`$OID_Paginas_PB    = "$($txtConf['OID_Paginas_PB'].Text)"

`$Relatorio_Dir   = ""
"@
    $content | Out-File -FilePath $ConfFile -Encoding UTF8
    [System.Windows.Forms.MessageBox]::Show("Configuracao salva com sucesso!", "Sucesso", "OK", "Information")
})
$tabConf.Controls.Add($btnSalvarConf)

# ── Aba 3: Testes de Conexao ─────────────────────────────────────
$tabTestes = New-Object System.Windows.Forms.TabPage
$tabTestes.Text = " Testes de Conexao "
$tabTestes.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$lblTestes = New-Object System.Windows.Forms.Label
$lblTestes.Text = "Testes de conexao ANTES do envio (servidor, SNMP e impressora):"
$lblTestes.Location = New-Object System.Drawing.Point(10, 10)
$lblTestes.Size = New-Object System.Drawing.Size(700, 20)

$txtLogTestes = New-Object System.Windows.Forms.TextBox
$txtLogTestes.Multiline = $true
$txtLogTestes.Location = New-Object System.Drawing.Point(10, 35)
$txtLogTestes.Size = New-Object System.Drawing.Size(745, 330)
$txtLogTestes.ScrollBars = "Both"
$txtLogTestes.ReadOnly = $true
$txtLogTestes.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$txtLogTestes.ForeColor = [System.Drawing.Color]::LimeGreen
$txtLogTestes.Font = New-Object System.Drawing.Font("Consolas", 10)

$btnTestarServidor = New-Object System.Windows.Forms.Button
$btnTestarServidor.Text = "1. Testar Servidor (HTTP/S)"
$btnTestarServidor.Location = New-Object System.Drawing.Point(10, 375)
$btnTestarServidor.Size = New-Object System.Drawing.Size(180, 45)
$btnTestarServidor.BackColor = [System.Drawing.Color]::MediumSlateBlue
$btnTestarServidor.ForeColor = [System.Drawing.Color]::White
$btnTestarServidor.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnTestarServidor.Add_Click({
    $url = "$Servidor_Base$Endpoint_Ingestao"
    Append-Log $txtLogTestes "[TESTE SERVIDOR] $url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if ($Servidor_Base -like "https://*" -and $Confiar_Certificado) {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        Append-Log $txtLogTestes "[INFO] HTTPS: certificado auto-assinado sera aceito (Confiar_Certificado=$Confiar_Certificado)"
    }
    try {
        # 1) GET na raiz
        $resp = Invoke-WebRequest -Uri "$Servidor_Base/" -TimeoutSec 15 -UseBasicParsing
        Append-Log $txtLogTestes "[OK] Servidor no ar: HTTP $($resp.StatusCode)"
        # 2) POST seco para validar API key + rota (sem linhas nao grava dados)
        try {
            $payload = @{ unidade = "TESTE_CONEXAO"; leituras = @() } | ConvertTo-Json
            $post = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Headers @{ "x-api-key" = $ApiKey } -Body $payload -TimeoutSec 15
            Append-Log $txtLogTestes "[OK] Rota de ingestao respondeu: success=$($post.success) erros=$($post.erros -join ';')"
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 400) { Append-Log $txtLogTestes "[OK] Rota respondeu (HTTP 400 esperado para payload sem leituras) - rota acessivel e validada." }
            elseif ($code -eq 401) { Append-Log $txtLogTestes "[FALHA] HTTP 401 - API Key invalida! Verifique a chave." }
            else { Append-Log $txtLogTestes "[FALHA] HTTP $code - $($_.Exception.Message)" }
        }
    } catch {
        Append-Log $txtLogTestes "[FALHA] Nao foi possivel conectar: $($_.Exception.Message)"
    }
})

$btnTestarSNMP = New-Object System.Windows.Forms.Button
$btnTestarSNMP.Text = "2. Testar SNMP (Todas)"
$btnTestarSNMP.Location = New-Object System.Drawing.Point(200, 375)
$btnTestarSNMP.Size = New-Object System.Drawing.Size(180, 45)
$btnTestarSNMP.BackColor = [System.Drawing.Color]::SeaGreen
$btnTestarSNMP.ForeColor = [System.Drawing.Color]::White
$btnTestarSNMP.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$btnTestarSNMP.Add_Click({
    $ips = CarregarImpressoras
    Append-Log $txtLogTestes "=== INICIANDO TESTE SNMP EM TODAS AS IMPRESSORAS ==="
    Append-Log $txtLogTestes "Total de IPs carregados do arquivo: $($ips.Count)"
    Append-Log $txtLogTestes "--------------------------------------------------"
    
    if ($ips.Count -eq 0) { 
        Append-Log $txtLogTestes "[ERRO] Nenhuma impressora em impressoras.txt"
        return 
    }

    foreach ($ip in $ips) {
        $ip = $ip.Trim()
        try {
            $snmp = New-Object -ComObject "OlePrn.OleSNMP"
            $snmp.Open($ip, $SNMP_Community, 2, $SNMP_Timeout)
            
            $modelo = $snmp.Get($OID_Modelo).ToString()
            if ([string]::IsNullOrWhiteSpace($modelo)) { throw "SNMP falhou ao ler o modelo." }

            try { $serial = $snmp.Get($OID_Serial).ToString() } catch { $serial = "N/A" }
            try { $total = $snmp.Get($OID_Paginas).ToString() } catch { $total = "0" }
            try { $pb = $snmp.Get($OID_Paginas_PB).ToString() } catch { $pb = "0" }
            try { $color = $snmp.Get($OID_Paginas_Color).ToString() } catch { $color = "0" }
            
            $snmp.Close()
            
            Append-Log $txtLogTestes "Consultando IP: $ip ... [ONLINE - OK]"
            Append-Log $txtLogTestes "  -> Modelo : $modelo"
            Append-Log $txtLogTestes "  -> Serial : $serial"
            Append-Log $txtLogTestes "  -> Total  : $total | PB: $pb | Color: $color"
        } catch {
            Append-Log $txtLogTestes "Consultando IP: $ip ... [ERRO - OFFLINE]"
            Append-Log $txtLogTestes "  -> Motivo : $($_.Exception.Message)"
        }
        Append-Log $txtLogTestes "--------------------------------------------------"
    }
    Append-Log $txtLogTestes "Teste de varredura concluido em todos os IPs!"
})

$btnTestarPingTodas = New-Object System.Windows.Forms.Button
$btnTestarPingTodas.Text = "3. Ping Todas"
$btnTestarPingTodas.Location = New-Object System.Drawing.Point(390, 375)
$btnTestarPingTodas.Size = New-Object System.Drawing.Size(140, 45)
$btnTestarPingTodas.Add_Click({
    $ips = CarregarImpressoras
    if ($ips.Count -eq 0) { Append-Log $txtLogTestes "[ERRO] Nenhuma impressora em impressoras.txt"; return }
    foreach ($ip in $ips) {
        $r = ping -n 1 -w 1000 $ip
        if ($r -match "TTL=") { Append-Log $txtLogTestes "[OK] $ip - Online" }
        else { Append-Log $txtLogTestes "[OFFLINE] $ip - Sem resposta" }
    }
})

$btnLimparTestes = New-Object System.Windows.Forms.Button
$btnLimparTestes.Text = "Limpar Log"
$btnLimparTestes.Location = New-Object System.Drawing.Point(540, 375)
$btnLimparTestes.Size = New-Object System.Drawing.Size(110, 45)
$btnLimparTestes.Add_Click({ $txtLogTestes.Clear() })

$tabTestes.Controls.AddRange(@($lblTestes, $txtLogTestes, $btnTestarServidor, $btnTestarSNMP, $btnTestarPingTodas, $btnLimparTestes))

# ── Aba 4: Execucao (Envio) ─────────────────────────────────────
$tabExec = New-Object System.Windows.Forms.TabPage
$tabExec.Text = " Execucao / Envio "
$tabExec.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$lblExec = New-Object System.Windows.Forms.Label
$lblExec.Text = "Executa o envio ao servidor (enviar_homolog.ps1 - com retry automatico):"
$lblExec.Location = New-Object System.Drawing.Point(10, 10)
$lblExec.Size = New-Object System.Drawing.Size(700, 20)

$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Multiline = $true
$txtLog.Location = New-Object System.Drawing.Point(10, 35)
$txtLog.Size = New-Object System.Drawing.Size(745, 340)
$txtLog.ScrollBars = "Both"
$txtLog.ReadOnly = $true
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$txtLog.ForeColor = [System.Drawing.Color]::LimeGreen
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 10)

$btnExecutar = New-Object System.Windows.Forms.Button
$btnExecutar.Text = "Executar Envio"
$btnExecutar.Location = New-Object System.Drawing.Point(10, 385)
$btnExecutar.Size = New-Object System.Drawing.Size(160, 45)
$btnExecutar.BackColor = [System.Drawing.Color]::ForestGreen
$btnExecutar.ForeColor = [System.Drawing.Color]::White
$btnExecutar.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnExecutar.Add_Click({
    $script = Join-Path $ScriptDir "enviar_homolog.ps1"
    if (-not (Test-Path $script)) { Append-Log $txtLog "[ERRO] enviar_homolog.ps1 nao encontrado em $ScriptDir"; return }
    $btnExecutar.Enabled = $false
    $txtLog.Clear()
    try {
        & powershell -ExecutionPolicy Bypass -File $script 2>&1 | ForEach-Object {
            Append-Log $txtLog ($_ | Out-String).TrimEnd()
            Start-Sleep -Milliseconds 50
        }
    } catch { Append-Log $txtLog "ERRO: $_" }
    $btnExecutar.Enabled = $true
    Append-Log $txtLog "Concluido."
})

$btnExecMonitor = New-Object System.Windows.Forms.Button
$btnExecMonitor.Text = "Executar Monitor + Envio"
$btnExecMonitor.Location = New-Object System.Drawing.Point(180, 385)
$btnExecMonitor.Size = New-Object System.Drawing.Size(190, 45)
$btnExecMonitor.BackColor = [System.Drawing.Color]::DodgerBlue
$btnExecMonitor.ForeColor = [System.Drawing.Color]::White
$btnExecMonitor.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnExecMonitor.Add_Click({
    $mon = Join-Path $ScriptDir "monitor.ps1"
    if (-not (Test-Path $mon)) {
        Append-Log $txtLog "[AVISO] monitor.ps1 nao encontrado na pasta do agente. Copie o monitor original para $ScriptDir"
        Append-Log $txtLog "[AVISO] Enviando apenas os CSVs ja existentes em relatorios/..."
    } else {
        Append-Log $txtLog "== Executando monitor.ps1 (coleta SNMP) =="
        & powershell -ExecutionPolicy Bypass -File $mon 2>&1 | ForEach-Object {
            Append-Log $txtLog ($_ | Out-String).TrimEnd()
            Start-Sleep -Milliseconds 50
        }
    }
    Append-Log $txtLog "== Executando envio HTTP =="
    $script = Join-Path $ScriptDir "enviar_homolog.ps1"
    & powershell -ExecutionPolicy Bypass -File $script 2>&1 | ForEach-Object {
        Append-Log $txtLog ($_ | Out-String).TrimEnd()
        Start-Sleep -Milliseconds 50
    }
    Append-Log $txtLog "Concluido."
})

$btnLimparLog = New-Object System.Windows.Forms.Button
$btnLimparLog.Text = "Limpar Log"
$btnLimparLog.Location = New-Object System.Drawing.Point(380, 385)
$btnLimparLog.Size = New-Object System.Drawing.Size(110, 45)
$btnLimparLog.Add_Click({ $txtLog.Clear() })

$tabExec.Controls.AddRange(@($lblExec, $txtLog, $btnExecutar, $btnExecMonitor, $btnLimparLog))

# ── Aba 5: Agendamento ───────────────────────────────────────────
$tabAgenda = New-Object System.Windows.Forms.TabPage
$tabAgenda.Text = " Agendamento "
$tabAgenda.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$lblAgenda = New-Object System.Windows.Forms.Label
$lblAgenda.Text = "Agendamento de Envios (Agendador de Tarefas do Windows):"
$lblAgenda.Location = New-Object System.Drawing.Point(15, 15)
$lblAgenda.Size = New-Object System.Drawing.Size(700, 25)
$lblAgenda.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)

$lblDesc = New-Object System.Windows.Forms.Label
$lblDesc.Text = "Configure multiplos disparos diarios para garantir o envio antes do fechamento do SLA (17:00):"
$lblDesc.Location = New-Object System.Drawing.Point(18, 42)
$lblDesc.Size = New-Object System.Drawing.Size(700, 22)
$lblDesc.ForeColor = [System.Drawing.Color]::FromArgb(80, 80, 80)

# Disparo 1 (Manha)
$lblHora1 = New-Object System.Windows.Forms.Label
$lblHora1.Text = "1o Disparo (Manha / Abertura):"
$lblHora1.Location = New-Object System.Drawing.Point(20, 75)
$lblHora1.Size = New-Object System.Drawing.Size(260, 25)

$dtpHora1 = New-Object System.Windows.Forms.DateTimePicker
$dtpHora1.Format = "Time"
$dtpHora1.ShowUpDown = $true
$dtpHora1.Location = New-Object System.Drawing.Point(290, 75)
$dtpHora1.Size = New-Object System.Drawing.Size(90, 25)
$dtpHora1.Value = [DateTime]"08:00"

# Disparo 2 (Almoco / Meio do dia)
$chkHora2 = New-Object System.Windows.Forms.CheckBox
$chkHora2.Text = "2o Disparo (Meio do dia / Almoco):"
$chkHora2.Location = New-Object System.Drawing.Point(20, 110)
$chkHora2.Size = New-Object System.Drawing.Size(260, 25)
$chkHora2.Checked = $true

$dtpHora2 = New-Object System.Windows.Forms.DateTimePicker
$dtpHora2.Format = "Time"
$dtpHora2.ShowUpDown = $true
$dtpHora2.Location = New-Object System.Drawing.Point(290, 110)
$dtpHora2.Size = New-Object System.Drawing.Size(90, 25)
$dtpHora2.Value = [DateTime]"11:30"

$chkHora2.Add_CheckedChanged({
    $dtpHora2.Enabled = $chkHora2.Checked
})

# Disparo 3 (Tarde / Pre-SLA)
$chkHora3 = New-Object System.Windows.Forms.CheckBox
$chkHora3.Text = "3o Disparo (Fim de Tarde / Pre-SLA):"
$chkHora3.Location = New-Object System.Drawing.Point(20, 145)
$chkHora3.Size = New-Object System.Drawing.Size(260, 25)
$chkHora3.Checked = $true

$dtpHora3 = New-Object System.Windows.Forms.DateTimePicker
$dtpHora3.Format = "Time"
$dtpHora3.ShowUpDown = $true
$dtpHora3.Location = New-Object System.Drawing.Point(290, 145)
$dtpHora3.Size = New-Object System.Drawing.Size(90, 25)
$dtpHora3.Value = [DateTime]"16:30"

$chkHora3.Add_CheckedChanged({
    $dtpHora3.Enabled = $chkHora3.Checked
})

# Disparo 4 (Ao Iniciar Windows / Logon)
$chkLogon = New-Object System.Windows.Forms.CheckBox
$chkLogon.Text = "Disparo adicional ao Iniciar o Windows / Logon do Usuario (garante envio no boot)"
$chkLogon.Location = New-Object System.Drawing.Point(20, 178)
$chkLogon.Size = New-Object System.Drawing.Size(650, 25)
$chkLogon.Checked = $true
$chkLogon.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)

$btnCriarTarefa = New-Object System.Windows.Forms.Button
$btnCriarTarefa.Text = "Criar / Atualizar Tarefa"
$btnCriarTarefa.Location = New-Object System.Drawing.Point(20, 215)
$btnCriarTarefa.Size = New-Object System.Drawing.Size(200, 40)
$btnCriarTarefa.BackColor = [System.Drawing.Color]::DodgerBlue
$btnCriarTarefa.ForeColor = [System.Drawing.Color]::White
$btnCriarTarefa.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnCriarTarefa.Add_Click({
    $triggers = @()
    $listaHorarios = @()

    $h1 = $dtpHora1.Value.ToString("HH:mm")
    $triggers += (New-ScheduledTaskTrigger -Daily -At $h1)
    $listaHorarios += $h1

    if ($chkHora2.Checked) {
        $h2 = $dtpHora2.Value.ToString("HH:mm")
        $triggers += (New-ScheduledTaskTrigger -Daily -At $h2)
        $listaHorarios += $h2
    }

    if ($chkHora3.Checked) {
        $h3 = $dtpHora3.Value.ToString("HH:mm")
        $triggers += (New-ScheduledTaskTrigger -Daily -At $h3)
        $listaHorarios += $h3
    }

    if ($chkLogon.Checked) {
        $triggers += (New-ScheduledTaskTrigger -AtLogOn)
        $listaHorarios += "Ao Iniciar Windows (Logon)"
    }

    $script = Join-Path $ScriptDir "executar_agente.ps1"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

    try {
        Register-ScheduledTask -TaskName "MonitorImpressorasHomolog" -Action $action -Trigger $triggers -Settings $settings -RunLevel Highest -Force
        $strHorarios = $listaHorarios -join ", "
        [System.Windows.Forms.MessageBox]::Show("Tarefa agendada com sucesso com $($triggers.Count) disparos:`n$strHorarios`n`n(Configuracoes ativadas: Acordar PC, Rodar se atrasado, Forcar Bateria)", "Sucesso", "OK", "Information")
        $lblStatusTarefa.Text = "Tarefa: ATIVA ($strHorarios) | Total de disparos: $($triggers.Count)"
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Erro ao agendar tarefa: $_", "Erro", "OK", "Error")
    }
})

$btnRemoverTarefa = New-Object System.Windows.Forms.Button
$btnRemoverTarefa.Text = "Remover Tarefa"
$btnRemoverTarefa.Location = New-Object System.Drawing.Point(230, 215)
$btnRemoverTarefa.Size = New-Object System.Drawing.Size(160, 40)
$btnRemoverTarefa.BackColor = [System.Drawing.Color]::Crimson
$btnRemoverTarefa.ForeColor = [System.Drawing.Color]::White
$btnRemoverTarefa.Add_Click({
    try {
        Unregister-ScheduledTask -TaskName "MonitorImpressorasHomolog" -Confirm:$false
        [System.Windows.Forms.MessageBox]::Show("Tarefa removida!", "Sucesso", "OK", "Information")
        $lblStatusTarefa.Text = "Tarefa: Nao configurada"
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Nenhuma tarefa encontrada.", "Info", "OK", "Information")
    }
})

$lblStatusTarefa = New-Object System.Windows.Forms.Label
$lblStatusTarefa.Location = New-Object System.Drawing.Point(20, 268)
$lblStatusTarefa.Size = New-Object System.Drawing.Size(720, 45)
$lblStatusTarefa.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)

$lblDica = New-Object System.Windows.Forms.Label
$lblDica.Text = "Como este fluxo reduz a zero o SLA Pendente:`n1. Ao ligar a maquina (logon), a coleta roda automaticamente.`n2. Os disparos das 11:30 e 16:30 garantem recuperacao em caso de queda de rede ou impressora desligada pela manha.`n3. O envio das 16:30 entrega os contadores antes do prazo final de SLA das 17:00."
$lblDica.Location = New-Object System.Drawing.Point(20, 320)
$lblDica.Size = New-Object System.Drawing.Size(720, 75)
$lblDica.ForeColor = [System.Drawing.Color]::FromArgb(80, 80, 80)

try {
    $tarefa = Get-ScheduledTask -TaskName "MonitorImpressorasHomolog" -ErrorAction SilentlyContinue
    if ($tarefa) {
        $trigTimes = @($tarefa.Triggers | ForEach-Object { 
            if ($_.StartBoundary) { ([DateTime]$_.StartBoundary).ToString("HH:mm") } 
            elseif ($_.ToString() -match "Logon" -or $_.CimClass.CimClassName -match "Logon") { "Ao Iniciar/Logon" }
        })
        $strTrigs = if ($trigTimes.Count -gt 0) { " (" + ($trigTimes -join ", ") + ")" } else { "" }
        $lblStatusTarefa.Text = "Tarefa: ATIVA$strTrigs | Proxima execucao: $($tarefa.NextRunTime)"
    }
    else { $lblStatusTarefa.Text = "Tarefa: Nao configurada" }
} catch { $lblStatusTarefa.Text = "Nao foi possivel verificar o agendador" }

$tabAgenda.Controls.AddRange(@(
    $lblAgenda, $lblDesc,
    $lblHora1, $dtpHora1,
    $chkHora2, $dtpHora2,
    $chkHora3, $dtpHora3,
    $chkLogon,
    $btnCriarTarefa, $btnRemoverTarefa,
    $lblStatusTarefa, $lblDica
))

# ── Aba 6: Sobre ─────────────────────────────────────────────────
$tabSobre = New-Object System.Windows.Forms.TabPage
$tabSobre.Text = " Sobre "
$tabSobre.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$txtSobre = New-Object System.Windows.Forms.TextBox
$txtSobre.Multiline = $true
$txtSobre.ReadOnly = $true
$txtSobre.BackColor = [System.Drawing.Color]::White
$txtSobre.BorderStyle = "None"
$txtSobre.Location = New-Object System.Drawing.Point(20, 20)
$txtSobre.Size = New-Object System.Drawing.Size(700, 400)
$txtSobre.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$txtSobre.Text = @"
Agente de Homologacao - Envio HTTP
====================================

Substitui o envio por e-mail / Google Drive pelo envio direto
ao servidor central via HTTP (endpoint /api/ingestao/teste).

Fluxo recomendado ANTES do envio (aba Testes de Conexao):
  1. Testar Servidor (HTTP)      -> valida rota e API Key
  2. Testar SNMP da impressora   -> valida coleta local
  3. Ping em todas as impressoras

Depois, na aba Execucao:
  - "Executar Envio"            -> envia o CSV mais recente de relatorios/
  - "Executar Monitor + Envio"  -> coleta SNMP e envia

Retry automatico: 10 tentativas com 30s de intervalo.

Requisitos: Windows, PowerShell 5.1+, acesso de rede ao servidor.
"@

$tabSobre.Controls.Add($txtSobre)

# ── Montar Tabs ──────────────────────────────────────────────────
$tabs.TabPages.AddRange(@($tabImp, $tabConf, $tabTestes, $tabExec, $tabAgenda, $tabSobre))
$form.Controls.Add($tabs)

# ── Exibir ───────────────────────────────────────────────────────
$form.ShowDialog() | Out-Null

