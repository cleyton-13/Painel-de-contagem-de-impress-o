# Painel BI — Konica Minolta

Dashboard corporativo para monitoramento de frotas de impressoras. Aplicação web Next.js 16 sem instalação nos clientes. Acesso via navegador.

---

## Acesso

- **URL**: `http://192.168.68.162:3000`
- **Banco**: PostgreSQL em `192.168.68.162:5432/bi_dashboard`
- **Pasta de CSVs**: `G:\Meu Drive\Relatorios_Impressoras` (Google Drive File Stream — acessível apenas na sessão do usuário logado)
- **Subst drive**: `subst W: \\192.168.68.162\desenvolvimento\Painel de impressoras BI\Saida`

---

## Comandos de Deploy

```powershell
# Parar servidor atual
taskkill /F /IM node.exe /T

# Limpar cache de build
Remove-Item W:\.next -Recurse -Force -ErrorAction SilentlyContinue

# Build de produção (webpack)
npm run build

# Iniciar servidor
npx next start -H 0.0.0.0 -p 3000
```

Ou use os scripts prontos:
- `Saida\INICIAR_PAINEL.bat` — kill node → build → start
- `Saida\PARAR.bat` — kill node

---

## Estrutura do Projeto

```
Saida/
├── app/
│   ├── page.tsx              # Layout principal (sidebar + header)
│   ├── layout.tsx            # Root layout com dark/light mode
│   ├── globals.css           # Estilos globais + overrides de light mode
│   ├── api/
│   │   ├── ingestao/route.ts # Ingestão de CSVs
│   │   ├── contagem-diaria/route.ts  # Contagem diária (com/dias)
│   │   ├── dashboard/route.ts
│   │   ├── impressoras/route.ts
│   │   ├── financeiro/route.ts
│   │   ├── armazenamento/route.ts
│   │   ├── contratos/route.ts
│   │   ├── sla/route.ts
│   │   ├── configuracao/route.ts
│   │   ├── unidades/route.ts
│   │   └── ia/               # Rotas de IA
│   │       ├── config/route.ts
│   │       ├── modelos/route.ts
│   │       └── analise/route.ts
├── components/
│   ├── Sidebar.tsx           # Navegação vertical (colapsável)
│   ├── Header.tsx            # Header com filtros (unidade, período, tema)
│   ├── TabContagemDiaria.tsx # Aba Contagem Diária (3 modos + expandir unidade)
│   ├── TabDashboard.tsx      # Dashboard com customização de gráficos
│   ├── TabImpressoras.tsx    # Parque de impressoras
│   ├── TabFinanceiro.tsx     # Projeções financeiras
│   ├── TabArmazenamento.tsx  # Armazenamento & SLA
│   ├── TabContratos.tsx      # Contratos & aliases
│   ├── FinanceToggle.tsx     # Toggle híbrido de franquia
│   ├── AIAnalysisModal.tsx   # Modal de análise de IA
│   ├── ReportExporter.tsx    # Extração de relatórios CSV
│   ├── ThemeContext.tsx      # Provider de tema dark/light
│   └── Tabs.tsx              # (legado, substituído por Sidebar)
├── lib/
│   ├── business.ts           # Lógica de negócio (KPIs, contagem, timeline)
│   ├── csvColumnMapper.ts    # Auto-detecção de formato CSV
│   ├── aiConfig.ts           # Configuração de IA (get/set)
│   ├── aiProviders.ts        # Provedores de IA (Groq, OpenAI, Gemini, etc.)
│   ├── config.ts             # Configurações do sistema (CSV path)
│   ├── email.ts              # SMTP/alertas de e-mail
│   ├── prisma.ts             # Cliente Prisma
│   └── types.ts              # Tipos TypeScript
├── prisma/
│   └── schema.prisma         # Schema do banco
├── scripts/
│   ├── fix-c3300i-data.mjs   # Migração: corrige PB=Color nas C3300i
│   ├── limpar-banco.mjs      # Limpa todas as tabelas
│   ├── reset-arquivos.mjs    # Reseta status de arquivos
│   ├── diagnostico.mjs       # Diagnóstico do banco
│   └── test-csv-parse.js     # Teste de parse de CSV
├── .env.local                # Variáveis de ambiente
├── next.config.ts
├── postcss.config.mjs
└── package.json
```

---

## Formatos CSV Suportados

### C300i (semicolon-separated, com aspas)
```
"Data";"Unidade";"IP";"Modelo";"Serial";"Paginas_Total";"Paginas_PB";"Paginas_Color";"Status"
```

### C3300i (TAB-separated, sem aspas)
```
Data	Unidade	IP	Modelo	Serial	Paginas_Total	Paginas_PB	Paginas_Color	Status
```

O parser detecta automaticamente o formato pelo separador (`;`, `,`, ou TAB real).

---

## C3300i — PB = Color (Dado Real)

**Problema conhecido**: O utilitário de exportação da Konica Minolta escreve o mesmo valor do contador "Total de páginas impressas" nas colunas PB e Color dos C3300i. Não são contadores separados — é o mesmo valor duplicado.

**Impacto**: Sem normalização, as C3300i apareciam consumindo 2x o real.

**Solução aplicada**: O sistema detecta automaticamente quando PB == Color em C3300i e normaliza (Color = 0, PB = total real). Cálculos de custo usam a taxa PB para todas as páginas.

**Dados corrigidos**: 4 leituras de C3300i já foram migradas no banco.

---

## Abas do Painel

1. **Contagem Diária** — consumo por impressora com detalhamento dia a dia (clique na unidade para expandir)
2. **Parque** — lista completa de impressoras com deltas e custos
3. **Financeiro** — projeções de custo por período
4. **Armazenamento** — gerenciamento de CSVs e alertas SLA
5. **Contratos** — gestão de perfis de franquia e aliases
6. **Dashboard** — visão geral executiva com KPIs, gráficos e customização

---

## Features de UI

- **Modo Claro/Escuro**: toggle no header, persiste no localStorage
- **Sidebar vertical**: colapsável à esquerda, com badges e ícones
- **Extrair Relatórios**: botão na sidebar com 5 relatórios CSV pré-definidos
- **Customização do Dashboard**: toggles para ligar/desligar gráficos e KPIs
- **Contagem Diária expandível**: clique na unidade para ver detalhamento dia a dia de cada impressora
- **Análise de IA**: botão na sidebar para gerar relatórios inteligentes com LLM

---

## Análise de IA

O painel inclui um assistente de IA que analisa os dados do dashboard e gera relatórios executivos em português.

### Configuração
1. Clique em **⚙** no modal de IA
2. Escolha o provedor (Groq, OpenAI, Gemini, Anthropic, OpenRouter)
3. Selecione o modelo (lista pré-definida por provedor)
4. Cole a API Key
5. Salve

### Provedores gratuitos pré-definidos
| Provedor | Modelo grátis | Onde conseguir a chave |
|----------|---------------|------------------------|
| Groq | Llama 3.3 70B | console.groq.com |
| Google Gemini | Gemini 2.0 Flash | aistudio.google.com |
| OpenRouter | Llama 3.1 8B (free) | openrouter.ai |

### O que a IA analisa
- KPIs do dashboard (total de páginas, custos, proporção PB/Color)
- Consumo por unidade com comparativo dia a dia
- Parque de impressoras (status, resets de placa)
- Ranking de filiais
- Timeline de consumo
- Projeções financeiras
- Unidades pendentes de SLA

### Saída
- Relatório formatado em markdown no painel
- Botão de download como arquivo `.md`

---

## Banco de Dados

### Schema principal
- **Unidade**: unidades organizacionais (filiais)
- **UnidadeAlias**: aliases para nomes de unidade
- **Impressora**: impressoras cadastradas (serial único)
- **LeituraImpressora**: leituras acumuladas (odômetro)
- **PerfilFranquia**: perfis de franquia com tarifas
- **ConfiguracaoSLA**: configuração de alertas de SLA
- **ArquivoIngerido**: controle de arquivos CSV processados
- **ConfiguracaoSistema**: path do diretório de CSVs
- **ConfiguracaoIA**: configuração do provedor de IA (provedor, modelo, API key)

### Conexão
```
postgresql://bi_user:[SENHA_NO_CREDENCIAIS_MD]@192.168.68.162:5432/bi_dashboard
```

### Prisma 7 — Driver Adapter
Prisma 7 requer driver adapter (`@prisma/adapter-pg` + `pg` Pool). O `prisma.config.ts` já está configurado com `PrismaPg`. Scripts auxiliares (`.mjs`) usam `pg.Pool` diretamente.

---

## Problemas Conhecidos

| Problema | Status |
|----------|--------|
| C3300i PB=Color (dado duplicado do CSV) | ✅ Normalizado no parser |
| Google Drive File Stream (G:) não acessível via terminal | ⚠️ Copiar CSVs manualmente na sessão do usuário |
| SMTP não configurado (placeholder no .env.local) | ⚠️ Aguardando credenciais Gmail |
| Build com cache turbopack antigo | ✅ Corrigido (limpar .next antes de rebuild) |

---

## Arquivos de Credenciais

Senhas e configs estão em `CREDENCIAIS.md` na raiz do projeto (substituindo `Ferramentas\Pass.txt`).

---

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Dev server
npm run dev

# Build produção
npm run build

# Lint
npm run lint

# Type check
npx tsc --noEmit
```
