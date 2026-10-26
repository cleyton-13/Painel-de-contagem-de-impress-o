# Guia de Operacao do Agente Executavel (spx-agent.exe)

O `spx-agent.exe` e o novo coletor de contadores em codigo de maquina (Go), compilado sem dependencias externas, consumindo menos de 10 MB de RAM e capaz de rodar como Servico do Windows com auto-atualizacao nativa.

---

## 1. Onde encontrar o executavel

O binario compilado encontra-se em:
- Desenvolvimento: `agent-go\spx-agent.exe`
- Distribuicao pelo Servidor: `public\agente\spx-agent.exe` (ou via download em `http://<servidor>:3001/api/agente/download?arquivo=spx-agent.exe`)

---

## 2. Comandos do Terminal (CLI)

Abra o prompt de comando (cmd ou PowerShell) na pasta do executavel:

### A. Executar uma coleta de teste no terminal
```powershell
.\spx-agent.exe run
```
Ele faz a varredura das impressoras em paralelo, exibe o progresso em tempo real e envia os contadores para o servidor.

### B. Ver as configuracoes ativas
```powershell
.\spx-agent.exe config
```

### C. Forcar verificacao de atualizacao
```powershell
.\spx-agent.exe update
```

---

## 3. Instalacao como Windows Service (Producao)

Para que o agente rode 100% invisivel em segundo plano, sem tela preta e mesmo quando o usuario da recepcao estiver deslogado:

1. Abra o PowerShell ou Prompt de Comando **como Administrador**.
2. Execute:
```powershell
.\spx-agent.exe service install
```
3. Inicie o servico:
```powershell
.\spx-agent.exe service start
```

Pronto! O servico `SPXAgentService` ficara registrado com:
- **Tipo de inicializacao:** Automatica com atraso (`Delayed Auto-Start`), garantindo que o Windows suba a rede antes do agente.
- **Conta de execucao:** `LocalSystem`.
- **Recuperacao automatica:** Se cair, o Windows reinicia o servico automaticamente apos 5 segundos.
- **Auto-Update ativo:** Ao detectar nova versao no servidor, baixa, substitui e reinicia sozinho.

### Para parar ou remover o servico:
```powershell
.\spx-agent.exe service stop
.\spx-agent.exe service remove
```

---

## 4. Arquivo de Configuracao (`config.json`)

Se `config.json` nao existir, o executavel cria um arquivo padrao automaticamente ou migra os dados de um `config.local.ps1` e `impressoras.txt` existentes na mesma pasta:

```json
{
  "unidade": "AE_PERUS",
  "servidorBase": "http://spx-hub.spximagem.com.br:3000",
  "endpointIngestao": "/api/ingestao/direto",
  "apiKey": "maSZhvdY5OtoAr9RGH2DWQlMsCEzeLXT",
  "impressoras": [
    "192.168.1.50",
    "192.168.1.51"
  ],
  "snmpCommunity": "public",
  "snmpTimeoutSec": 2,
  "horariosDisparo": [
    "08:00",
    "12:00",
    "16:00",
    "20:00"
  ],
  "autoUpdate": true
}
```
