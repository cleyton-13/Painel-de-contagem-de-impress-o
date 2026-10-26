# Plano de Modernizacao do Agente e Blindagem de Seguranca

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o agente de coleta em um executavel nativo .EXE em Go com auto-update automatico e execucao como Windows Service, implementar endpoints de atualizacao remota no servidor, e blindar o Painel BI com autenticacao JWT/sessao e segregacao de chaves.

**Architecture:** O servidor Next.js 14 passa a fornecer endpoints de gestao e auto-update (`/api/agente/versao`, `/api/agente/download`), autenticacao JWT para rotas do painel, e validacao de chaves por unidade. Na borda (clinicas), o novo agente compilado em Go (`spx-agent.exe`) roda como Windows Service nativo em background, executa varredura SNMP assincrona em paralelo (<1s), possui rotina de auto-atualizacao transparente via HTTP(S), e elimina a necessidade de acessos manuais as maquinas.

**Tech Stack:** Go (Golang) 1.22+, `gosnmp`, `golang.org/x/sys/windows/svc`, Next.js 14 App Router, TypeScript, Prisma ORM, PostgreSQL, Jose (JWT), Zod.

**Spec:** Baseado na analise de arquitetura do projeto Painel de Impressoras BI, visando mitigar SLA pendente, cessar intervencao manual nas maquinas, e proteger dados sensiveis.

## Global Constraints
- Nenhuma alteracao no layout ou componentes visuais da Dashboard (a UI original restaurada no commit d05fac5 deve ser mantida).
- O ambiente de producao em `\\192.168.68.162\...\Saida` permanece protegido e intacto. Todo o desenvolvimento ocorre na branch `feature/otimizacao-sla`.
- Compatibilidade retroativa total: o endpoint de ingestao continua aceitando os envios dos scripts legados enquanto as maquinas migram para o novo agente.

## Review Focus
1. Concorrencia de leitura SNMP em multiplas impressoras sem memory leak ou travamento.
2. O auto-updater nao pode corromper o binario se a conexao oscilar durante o download (uso de arquivo temporario e substituicao atomica).
3. O Windows Service deve inicializar em menos de 100ms e respeitar os sinais de parada/reinicio do Service Control Manager (SCM).
4. As rotas de ingestao (`/api/ingestao/direto`) devem continuar funcionando perfeitamente sem quebrar os envios existentes.
5. As credenciais e sessoes JWT devem usar cookies seguros (`HttpOnly`, `SameSite=Lax`).

---

### Task 1: Endpoint de Auto-Update no Servidor e Atualizacao no Script Legado
- [ ] Criar `/api/agente/versao` e `/api/agente/download` no Next.js
- [ ] Adicionar checagem de auto-atualizacao no `executar_agente.ps1` legado
- [ ] Testar entrega de versao e download de arquivos via HTTP

### Task 2: Ambiente Go e Motor de Coleta SNMP Paralela (`spx-agent`)
- [ ] Instalar Go via winget e criar modulo `agent/`
- [ ] Implementar cliente SNMP assincrono paralelo (goroutines) com OIDs Brother, Konica e RFC
- [ ] Implementar wake-up ping e log estruturado

### Task 3: Windows Service e Auto-Update Nativo no Agente Go
- [ ] Implementar integracao com Windows Service (`svc.Handler`)
- [ ] Implementar comandos CLI: `spx-agent.exe install`, `uninstall`, `start`, `stop`, `run`
- [ ] Implementar rotina interna de auto-update com download atomico e restart

### Task 4: Autenticacao Segura por Sessao/JWT na Dashboard
- [ ] Criar rotas `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- [ ] Implementar modal de login elegante sem alterar os cards/layout da dashboard
- [ ] Proteger rotas de configuracao e financeiro com middleware/token JWT

### Task 5: Validacao Integrada e Documentacao de Deploy
- [ ] Executar build do binario `spx-agent.exe`
- [ ] Testar ciclo completo: coleta SNMP -> envio HTTP -> ingestao no banco
- [ ] Documentar guia de implantacao silenciosa via GPO/bat/prompt de comando
