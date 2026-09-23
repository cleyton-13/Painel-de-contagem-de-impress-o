# ============================================================
# GERAR_CERTIFICADO.ps1 - Painel de Impressoras BI (Ferramentas)
#
# Gera um certificado HTTPS (auto-assinado) para uso local/Intranet:
#   - assinado para: 192.168.68.162, localhost
#   - saida: cert\painel.pfx + cert\painel.cer + cert\senha.txt
#
# PRODUCAO COM DOMINIO (Let's Encrypt) - quando tiver dominio:
#   1. Instale o certbot no servidor:  winget install certbot
#   2. Rode:  certbot certonly --standalone -d painel.suacorp.com.br
#   3. Copie os arquivos para a pasta "cert" na raiz do projeto:
#        cert\fullchain.pem   (de C:\Certbot\live\painel.suacorp.com.br\)
#        cert\privkey.pem     (de C:\Certbot\live\painel.suacorp.com.br\)
#   4. Reinicie o painel (INICIAR_PAINEL.bat / servico Windows)
#   O server.js DETECTA os arquivos .pem e usa o certificado real;
#   se nao existirem, usa o painel.pfx auto-assinado.
# ============================================================

$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = (Get-Item (Join-Path $toolDir "..")).FullName
$pastaCert = Join-Path $raiz 'cert'
New-Item -ItemType Directory -Path $pastaCert -Force | Out-Null

$pfxPath  = Join-Path $pastaCert 'painel.pfx'
$cerPath  = Join-Path $pastaCert 'painel.cer'
$senhaPath = Join-Path $pastaCert 'senha.txt'

Write-Host "== Gerando certificado HTTPS auto-assinado ==" -ForegroundColor Cyan

$senha = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

# Certificado sem chave de privada exportavel = problemas: forca agora com KeyExportPolicy
$cert = New-SelfSignedCertificate `
    -Subject "CN=192.168.68.162, O=Painel Impressoras BI" `
    -DnsName @('192.168.68.162', 'localhost') `
    -KeyAlgorithm RSA -KeyLength 2048 `
    -KeyExportPolicy Exportable `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(3) `
    -HashAlgorithm SHA256

$secureSenha = ConvertTo-SecureString -String $senha -Force -AsPlainText

# Exporta PFX (usado pelo server.js) e CER (para instalar nos agentes)
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secureSenha | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Set-Content -Path $senhaPath -Value $senha -Encoding ascii

Write-Host "Certificado gerado:" -ForegroundColor Green
Write-Host "  PFX : $pfxPath (usado pelo servidor)" 
Write-Host "  CER : $cerPath (instalar nos agentes como Raiz Confiavel)"
Write-Host "  Senha guardada em: $senhaPath"
Write-Host ""
Write-Host "Para AGENTES (PowerShell) confiarem no certificado:" -ForegroundColor Yellow
Write-Host "  Import-Certificate -FilePath cert\painel.cer -CertStoreLocation Cert:\LocalMachine\Root"
Write-Host ""
Write-Host "Para PRODUCAO COM DOMINIO: coloque fullchain.pem + privkey.pem (Let's Encrypt)"
Write-Host "na pasta 'cert' na raiz do projeto e reinicie o painel."
