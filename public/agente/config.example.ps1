# ==============================================================================
# MODELO DE CONFIGURACAO DO AGENTE POWERSHELL LEGADO
# Copie este arquivo para a maquina da filial como config.local.ps1 e preencha
# ==============================================================================

$Unidade             = "NOME_DA_UNIDADE"
$Servidor_Base       = "http://spx-hub.spximagem.com.br:3000"
$Endpoint_Ingestao   = "/api/ingestao/direto"

# Preencha com a INGESTAO_API_KEY configurada no servidor central
$ApiKey              = ""

$Confiar_Certificado = $false
$Enviar_Multipart    = $true

$SNMP_Community      = "public"
$SNMP_Timeout        = 3000

$OID_Modelo          = ".1.3.6.1.2.1.1.1.0"
$OID_Serial          = ".1.3.6.1.2.1.43.5.1.1.17.1"
$OID_Paginas         = ".1.3.6.1.2.1.43.10.2.1.4.1.1"
$OID_Paginas_Color   = ".1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.2.2"
$OID_Paginas_PB      = ".1.3.6.1.4.1.18334.1.1.1.5.7.2.2.1.5.1.2"

$Relatorio_Dir       = ""

