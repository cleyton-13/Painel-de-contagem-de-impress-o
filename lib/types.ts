export interface Unidade {
  id: string;
  nome: string;
  nomeSanitizado: string;
  perfilFranquiaId?: string | null;
  perfilFranquia?: PerfilFranquia | null;
  aliases?: UnidadeAlias[];
  impressoras?: number;
  leituras?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UnidadeAlias {
  id: string;
  alias: string;
  unidadeId: string;
  createdAt: string;
}

export interface Impressora {
  id: string;
  serial: string;
  modelo: string;
  ip: string;
  apelido?: string | null;
  unidadeId: string;
  unidadeNome?: string;
  status: 'Online' | 'Offline' | 'Erro SNMP';
  consumoPBDelta: number;
  consumoColorDelta: number;
  totalImpresso: number;
  custoEstimado: number;
  resetPlaca?: boolean;
  preExistente?: boolean;
  leituraReferenciaPB?: number | null;
  leituraReferenciaColor?: number | null;
  quebraPorTipoIndisponivel?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeituraImpressora {
  id: string;
  dataHora: string;
  paginasTotal: number;
  paginasPB: number;
  paginasColor: number;
  status: string;
  resetPlaca: boolean;
  ip: string;
  serial: string;
  impressoraId?: string | null;
  unidadeId: string;
  createdAt: string;
}

export interface PerfilFranquia {
  id: string;
  nome: string;
  tarifaAvulsaPB: number;
  tarifaAvulsaColor: number;
  temFranquiaFixa: boolean;
  valorFixoMensal?: number | null;
  cotaPB?: number | null;
  cotaColor?: number | null;
  excedentePB?: number | null;
  excedenteColor?: number | null;
  precoResmaPapel: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfiguracaoSistema {
  usarSeparacaoCores: boolean;
  faturamentoHabilitado: boolean;
  tarifaUnica: number;
  acessivel: boolean;
  erro?: string;
  atualizadoEm: string;
}

export interface ArquivoIngerido {
  id: string;
  nomeArquivo: string;
  dataProcessamento: string;
  tamanhoBytes: number;
  status: 'PROCESSADO' | 'ATUALIZADO' | 'DUPLICADO' | 'ERRO';
  erroMensagem?: string | null;
  novas?: number;
  atualizadas?: number;
}

export interface DashboardKPIs {
  totalImpresso: number;
  totalPB: number;
  totalColor: number;
  custoTotal: number;
  proporcaoPB: number; // percentage 0-100
  proporcaoColor: number; // percentage 0-100
  unidadeLider: {
    nome: string;
    total: number;
    custo: number;
  };
  topImpressoras: Array<{
    serial: string;
    modelo: string;
    unidade: string;
    total: number;
  }>;
  mediaDiariaFrota: number;
  projecaoMensal: number;
  cppMedio: number;
  resmasEquivalentes: number;
  totalImpressoras: number;
  impressorasOnline: number;
  impressorasOffline: number;
  impressorasReset: number;
  unidadesPendentesSLA: Array<{
    id: string;
    nome: string;
    ultimaLeitura?: string;
  }>;
}

export interface TimelineDataPoint {
  data: string; // "YYYY-MM-DD" or "DD/MM"
  paginasPB: number;
  paginasColor: number;
  total: number;
  custo: number;
}

export interface BranchRankingItem {
  unidade: string;
  paginasPB: number;
  paginasColor: number;
  total: number;
  custo: number;
}

export interface FinancialProjection {
  periodo: 'Diário' | 'Semanal' | 'Mensal' | 'Trimestral' | 'Semestral' | 'Anual';
  dias: number;
  paginasEstimadasPB: number;
  paginasEstimadasColor: number;
  paginasEstimadasTotal?: number;
  custoEstimadoPB: number;
  custoEstimadoColor: number;
  custoFranquiaFixa: number;
  custoTotalEstimado: number;
  resmasEstimadas: number;
  caixasEstimadas: number; // 5 resmas por caixa
  custoPapelEstimado: number;
}

export interface ContagemDiariaItem {
  data: string;
  unidadeId: string;
  unidadeNome: string;
  impressoraId: string;
  serial: string;
  modelo: string;
  apelido: string | null;
  ip: string;
  paginasPBDia: number;
  paginasColorDia: number;
  totalDia: number;
  paginasPBTotal: number;
  paginasColorTotal: number;
  totalPeriodo: number;
}

export interface ContagemDiariaDiaItem {
  data: string;
  unidadeId: string;
  unidadeNome: string;
  impressoraId: string;
  serial: string;
  modelo: string;
  apelido: string | null;
  ip: string;
  paginasPB: number;
  paginasColor: number;
  total: number;
}

export interface ContagemDiariaAgrupada {
  unidadeId: string;
  unidadeNome: string;
  impressoraId: string;
  serial: string;
  modelo: string;
  apelido: string | null;
  ip: string;
  paginasPBDia: number;
  paginasColorDia: number;
  totalDia: number;
  paginasPBTotal: number;
  paginasColorTotal: number;
  totalPeriodo: number;
  quebraPorTipo?: boolean;
  dias: ContagemDiariaDiaItem[];
}

export type ProvedorIA = 'groq' | 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'ollama';

export interface ConfiguracaoIA {
  id: string;
  provedor: ProvedorIA;
  modelo: string;
  apiKey: string;
  endpointUrl: string;
  temperatura: number;
  maxTokens: number;
  idioma: string;
  updatedAt: string;
}

export interface ModeloIA {
  id: string;
  nome: string;
  livre: boolean;
  descricao: string;
}

export interface RespostaAnaliseIA {
  texto: string;
  provedor: string;
  modelo: string;
  duracaoMs: number;
}

// Monitor de Envios
export interface MonitorEnvioUnidade {
  unidadeId: string;
  unidadeNome: string;
  ultimoArquivo: string | null;
  dataUltimoEnvio: string | null;
  statusUltimoEnvio: string | null;
  leiturasHoje: number;
  impressoesDia: number;
  enviosHoje: number;
  pendenteHoje: boolean;
}

export interface MonitorEnvioRegistro {
  id: string;
  nomeArquivo: string;
  dataProcessamento: string;
  tamanhoBytes: number;
  status: string;
  unidadeNome: string;
  novas: number;
  atualizadas: number;
}

export interface MonitorEnviosPayload {
  unidades: MonitorEnvioUnidade[];
  registros: MonitorEnvioRegistro[];
  atualizadoEm: string;
}
