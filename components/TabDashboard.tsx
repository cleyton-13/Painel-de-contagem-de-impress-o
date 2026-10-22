'use client';

import React, { useState } from 'react';
import {
  FileText, DollarSign, PieChart as PieIcon, Trophy, AlertOctagon, Clock, AlertTriangle,
  CheckCircle2, XCircle, RotateCcw, TrendingUp, Activity, Eye, EyeOff
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { DashboardKPIs, TimelineDataPoint, BranchRankingItem } from '@/lib/types';
import { useTheme } from './ThemeContext';
import { chartTheme } from '@/lib/chartTheme';

interface TabDashboardProps {
  kpis: DashboardKPIs;
  timeline: TimelineDataPoint[];
  branchRanking: BranchRankingItem[];
  showCosts?: boolean;
  hideCurrency?: boolean;
  usarSeparacaoCores?: boolean;
}

interface ChartVisibility {
  kpiCards: boolean;
  statusBar: boolean;
  timeline: boolean;
  donut: boolean;
  ranking: boolean;
  slaAlerts: boolean;
}

export const TabDashboard: React.FC<TabDashboardProps> = ({
  kpis,
  timeline,
  branchRanking,
  showCosts,
  hideCurrency,
  usarSeparacaoCores = true,
}) => {
  const { theme, palette } = useTheme();
  void palette; // assina o contexto: trocar a paleta re-renderiza e os gráficos releem as vars
  const isDark = theme === 'dark';

  // Cores vindas das vars globais (globals.css) — reagem à paleta
  const chartGrid = chartTheme.grid();
  const chartAxis = chartTheme.axis();
  const tooltipBg = chartTheme.tooltipBg();
  const tooltipBorder = chartTheme.tooltipBorder();
  const tooltipColor = chartTheme.tooltipColor();
  const [visibility, setVisibility] = useState<ChartVisibility>({
    kpiCards: true,
    statusBar: true,
    timeline: true,
    donut: true,
    ranking: true,
    slaAlerts: true,
  });

  const [modoFinanceiro, setModoFinanceiro] = useState(false);
  const [filtroSla, setFiltroSla] = useState<'todos' | 'aguardando' | 'offline'>('todos');

  const agora = new Date();
  const isAposHorarioLimite = agora.getHours() >= 17;

  const pendentesAguardandoHoje = kpis.unidadesPendentesSLA.filter(
    (u) => u.tipoPendencia === 'aguardando_hoje' || (u.diasSemLeitura !== undefined && u.diasSemLeitura <= 1)
  );
  const pendentesOfflineProlongado = kpis.unidadesPendentesSLA.filter(
    (u) => u.tipoPendencia === 'offline_prolongado' || (u.diasSemLeitura !== undefined && u.diasSemLeitura > 1) || u.diasSemLeitura === undefined
  );

  const pendentesExibidos = filtroSla === 'aguardando'
    ? pendentesAguardandoHoje
    : filtroSla === 'offline'
    ? pendentesOfflineProlongado
    : kpis.unidadesPendentesSLA;

  const toggle = (key: keyof ChartVisibility) => {
    setVisibility((v) => ({ ...v, [key]: !v[key] }));
  };

  const pieData = [
    { name: 'P&B', value: kpis.totalPB, color: chartTheme.pb() },
    { name: 'Color', value: kpis.totalColor, color: chartTheme.color() }
  ];

  const formatCurrency = (v: number) => hideCurrency ? '***' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const visibilityControls: Array<{ key: keyof ChartVisibility; label: string }> = [
    { key: 'slaAlerts', label: 'Alertas SLA' },
    { key: 'kpiCards', label: 'KPIs' },
    { key: 'statusBar', label: 'Status Frota' },
    { key: 'timeline', label: 'Timeline' },
    ...(usarSeparacaoCores ? [{ key: 'donut' as const, label: 'Donut Cores' }] : []),
    { key: 'ranking', label: 'Ranking Filiais' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Dashboard Customization Bar */}
      <div className="bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Eye className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">Visibilidade:</span>
          {visibilityControls.map((vc) => (
            <button
              key={vc.key}
              onClick={() => toggle(vc.key)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                visibility[vc.key]
                  ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800/60'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {visibility[vc.key] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>{vc.label}</span>
            </button>
          ))}
        </div>
        
        <button
          onClick={() => setModoFinanceiro(!modoFinanceiro)}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
            modoFinanceiro 
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
              : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Modo Financeiro {modoFinanceiro ? 'Ativado' : 'Desativado'}</span>
        </button>
      </div>

      {/* SLA Alert Banner */}
      {visibility.slaAlerts && kpis.unidadesPendentesSLA.length > 0 && (
        <div className={`border rounded-2xl p-4 shadow-sm transition-all duration-300 ${
          isAposHorarioLimite
            ? 'bg-red-50/80 dark:bg-red-950/35 border-red-200 dark:border-red-800/50 text-red-950 dark:text-red-100'
            : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/40 text-amber-950 dark:text-amber-100'
        }`}>
          <div className="flex items-start space-x-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              isAposHorarioLimite
                ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300'
                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300'
            }`}>
              {isAposHorarioLimite ? <AlertOctagon className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className={`text-sm font-semibold tracking-wide flex items-center gap-2 ${
                    isAposHorarioLimite ? 'text-red-800 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'
                  }`}>
                    {isAposHorarioLimite ? 'Auditoria SLA · Não Conforme (Fora do Prazo)' : 'Ciclo Diário de Coletas · Aguardando Sincronização'}
                    <span className="font-normal text-xs opacity-75">
                      ({kpis.unidadesPendentesSLA.length} unidade{kpis.unidadesPendentesSLA.length > 1 ? 's' : ''})
                    </span>
                  </h3>
                  <p className="text-xs mt-0.5 opacity-80">
                    {isAposHorarioLimite
                      ? 'Horário limite das 17:00 encerrado. As unidades abaixo não transmitiram dados no ciclo de hoje.'
                      : 'Janela diária em aberto (disparos programados: manhã, 11:30 e 16:30). Apenas coletas não recebidas após as 17:00 entram em atraso de SLA.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full shadow-sm ${
                    isAposHorarioLimite
                      ? 'bg-red-600 dark:bg-red-500 text-white'
                      : 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60'
                  }`}>
                    {isAposHorarioLimite ? 'Prazo Esgotado: 17:00' : 'Limite SLA: 17:00'}
                  </span>
                </div>
              </div>

              {/* Filtros de visualização */}
              <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/40">
                <button
                  type="button"
                  onClick={() => setFiltroSla('todos')}
                  className={`px-2 py-0.5 text-xs rounded-lg font-medium transition-all cursor-pointer ${
                    filtroSla === 'todos'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Todas ({kpis.unidadesPendentesSLA.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroSla('aguardando')}
                  className={`px-2 py-0.5 text-xs rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    filtroSla === 'aguardando'
                      ? 'bg-amber-600 dark:bg-amber-500 text-white shadow-xs'
                      : 'text-amber-700 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Aguardando Ciclo Hoje ({pendentesAguardandoHoje.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroSla('offline')}
                  className={`px-2 py-0.5 text-xs rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    filtroSla === 'offline'
                      ? 'bg-rose-600 dark:bg-rose-500 text-white shadow-xs'
                      : 'text-rose-700 dark:text-rose-300 hover:bg-rose-100/60 dark:hover:bg-rose-900/30'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Sem Comunicação &gt; 48h ({pendentesOfflineProlongado.length})
                </button>
              </div>

              {/* Lista de pílulas */}
              <div className="mt-2.5 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {pendentesExibidos.map((u) => {
                  const ultimaData = u.ultimaLeitura ? new Date(u.ultimaLeitura) : null;
                  let textoRelativo = 'sem leituras';
                  let tooltipData = '';
                  const ehAguardandoHoje = u.tipoPendencia === 'aguardando_hoje' || (u.diasSemLeitura !== undefined && u.diasSemLeitura <= 1);

                  if (ultimaData) {
                    tooltipData = ultimaData.toLocaleString('pt-BR');
                    const diffMs = agora.getTime() - ultimaData.getTime();
                    const diffMin = Math.floor(diffMs / 60000);
                    const diffH = Math.floor(diffMin / 60);
                    const diffD = Math.floor(diffH / 24);
                    if (diffD >= 2) textoRelativo = `há ${diffD} dias`;
                    else if (diffD === 1) textoRelativo = 'ontem';
                    else if (diffH >= 1) textoRelativo = `há ${diffH}h`;
                    else textoRelativo = `há ${diffMin}min`;
                  }

                  return (
                    <div
                      key={u.id}
                      title={tooltipData ? `Último envio registrado: ${tooltipData}` : 'Nenhuma leitura registrada'}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs cursor-default border transition-all ${
                        ehAguardandoHoje
                          ? 'bg-white dark:bg-slate-900/70 border-amber-200 dark:border-amber-800/60 text-slate-800 dark:text-slate-200'
                          : 'bg-white dark:bg-red-950/60 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        ehAguardandoHoje
                          ? (isAposHorarioLimite ? 'bg-red-500' : 'bg-amber-500')
                          : 'bg-rose-500'
                      }`} />
                      <span className="font-semibold">{u.nome}</span>
                      <span className="opacity-40">·</span>
                      <span className={`text-[11px] ${
                        ehAguardandoHoje
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-rose-600 dark:text-rose-400 font-medium'
                      }`}>
                        {ehAguardandoHoje ? `última: ${textoRelativo}` : `offline: ${textoRelativo}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {visibility.kpiCards && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. Volume Total (Operacional) */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(34,211,238,0.15)] transition-all duration-300">
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Volume Impresso</span>
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-blue-950 text-blue-400 border border-blue-800/60' : 'bg-blue-100 text-blue-600 border border-blue-200'}`}>
                  <FileText className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <h2 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tight">
                  {kpis.totalImpresso.toLocaleString('pt-BR')} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">pag.</span>
                </h2>
                {usarSeparacaoCores && (
                  <div className="mt-2 flex items-center space-x-3 text-xs">
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{kpis.totalPB.toLocaleString('pt-BR')} P&B</span>
                    <span className="text-slate-400 dark:text-slate-600">|</span>
                    <span className="text-pink-600 dark:text-pink-400 font-semibold">{kpis.totalColor.toLocaleString('pt-BR')} Color</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Média Diária / Proporção (Operacional) */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(236,72,153,0.15)] transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Média da Frota</span>
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-purple-950 text-purple-400 border border-purple-800/60' : 'bg-purple-100 text-purple-600 border border-purple-200'}`}>
                  <Activity className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <h2 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                  {kpis.mediaDiariaFrota?.toLocaleString('pt-BR')} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">pag/dia</span>
                </h2>
                {usarSeparacaoCores && (
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full mt-3 overflow-hidden flex">
                    <div style={{ width: `${kpis.proporcaoPB}%` }} className="bg-blue-500 h-full" title={`PB: ${kpis.proporcaoPB}%`} />
                    <div style={{ width: `${kpis.proporcaoColor}%` }} className="bg-pink-500 h-full" title={`Color: ${kpis.proporcaoColor}%`} />
                  </div>
                )}
              </div>
            </div>

            {/* 3. Impacto / Top Impressoras (Operacional) */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(251,191,36,0.15)] transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Impacto de Papel</span>
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-amber-950 text-amber-400 border border-amber-800/60' : 'bg-amber-100 text-amber-600 border border-amber-200'}`}>
                  <PieIcon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <h2 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-400 truncate">
                  {kpis.resmasEquivalentes?.toLocaleString('pt-BR')} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">Resmas</span>
                </h2>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Equivalente ao volume impresso</span>
                </div>
              </div>
            </div>

            {/* 4. Unidade Lider (Operacional / Financeiro) */}
            <div className="glass-panel rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(251,191,36,0.15)] transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unidade Lider</span>
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-amber-950 text-amber-400 border border-amber-800/60' : 'bg-amber-100 text-amber-600 border border-amber-200'}`}>
                  <Trophy className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-400 truncate">{kpis.unidadeLider.nome}</h2>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{kpis.unidadeLider.total.toLocaleString('pt-BR')} pag.</span>
                  {modoFinanceiro && (
                    <span className="text-emerald-400 font-medium">{formatCurrency(kpis.unidadeLider.custo)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cards Financeiros (Apenas se ativado) */}
          {modoFinanceiro && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fadeIn">
              <div className={`glass-panel rounded-2xl p-5 relative overflow-hidden ${isDark ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50/50'}`}>
                <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Fatura do Período</span>
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-100 text-emerald-600'}`}>
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
                    {hideCurrency ? '***' : `R$ ${kpis.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </h2>
                </div>
              </div>

              <div className={`glass-panel rounded-2xl p-5 relative overflow-hidden ${isDark ? 'border-teal-900/50 bg-teal-950/20' : 'border-teal-200 bg-teal-50/50'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider">Projeção 30 Dias</span>
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-teal-900 text-teal-300' : 'bg-teal-100 text-teal-600'}`}>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-200">
                    {hideCurrency ? '***' : `R$ ${kpis.projecaoMensal?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </h2>
                </div>
              </div>

              <div className={`glass-panel rounded-2xl p-5 relative overflow-hidden ${isDark ? 'border-cyan-900/50 bg-cyan-950/20' : 'border-cyan-200 bg-cyan-50/50'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">Custo Médio p/ Página</span>
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-cyan-900 text-cyan-300' : 'bg-cyan-100 text-cyan-600'}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-200">
                    {hideCurrency ? '***' : `R$ ${kpis.cppMedio?.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
                  </h2>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Bar */}
      {visibility.statusBar && (
        <div className="bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Status Frota:</span>
          </div>
          <div className="flex items-center space-x-6 text-xs font-semibold">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-700 dark:text-slate-300">{kpis.impressorasOnline} Online</span>
            </div>
            <div className="flex items-center space-x-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-slate-700 dark:text-slate-300">{kpis.impressorasOffline} Offline</span>
            </div>
            {kpis.impressorasReset > 0 && (
              <div className="flex items-center space-x-2 px-2.5 py-1 bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-md">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{kpis.impressorasReset} Reset</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {visibility.timeline && (
          <div className="lg:col-span-2 glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Evolucao Temporal</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {usarSeparacaoCores ? 'Consumo diario PB vs Color' : 'Consumo diario (odometro total)'}
                </p>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-pb)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--chart-pb)" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-color)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--chart-color)" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-total)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--chart-total)" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} opacity={0.3} />
                  <XAxis dataKey="data" stroke={chartAxis} fontSize={12} />
                  <YAxis stroke={chartAxis} fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '12px', fontSize: '13px', color: tooltipColor }} />
                  <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                  {usarSeparacaoCores ? (
                    <>
                      <Area type="monotone" dataKey="paginasPB" name="P&B" stroke="var(--chart-pb)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPB)" />
                      <Area type="monotone" dataKey="paginasColor" name="Color" stroke="var(--chart-color)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorColor)" />
                    </>
                  ) : (
                    <Area type="monotone" dataKey="total" name="Total" stroke="var(--chart-total)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTotal)" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {usarSeparacaoCores ? (
          visibility.donut && (
            <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Distribuicao de Cores</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Proporcao PB vs Color</p>
              </div>
              <div className="h-56 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '12px', fontSize: '13px', color: tooltipColor }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center pointer-events-none">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Total</span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">{kpis.totalImpresso.toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-slate-600 dark:text-slate-300 font-medium">P&B</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">{kpis.proporcaoPB}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-pink-500" />
                    <span className="text-slate-600 dark:text-slate-300 font-medium">Color</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">{kpis.proporcaoColor}%</span>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="glass-panel rounded-2xl p-5 flex flex-col justify-center">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Distribuicao de Cores</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Separacao de cores desativada</p>
            </div>
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-xl text-xs leading-relaxed font-medium space-y-1">
              <p className="font-bold text-amber-900 dark:text-amber-100">Modo Total ativo:</p>
              <p>A contagem usa o odometro <strong>Paginas_Total</strong> (dados brutos).</p>
              <p>Os contadores PB/Color estao zerados e ocultos ate a separacao de cores ser reativada.</p>
            </div>
          </div>
        )}
      </div>

      {/* Ranking */}
      {visibility.ranking && (
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Ranking de Filiais</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Volume por unidade</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchRanking} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} opacity={0.3} />
                <XAxis dataKey="unidade" stroke={chartAxis} fontSize={12} angle={-15} textAnchor="end" />
                <YAxis stroke={chartAxis} fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '12px', fontSize: '13px', color: tooltipColor }} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                {usarSeparacaoCores ? (
                  <>
                    <Bar dataKey="paginasPB" name="P&B" fill="var(--chart-pb)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="paginasColor" name="Color" fill="var(--chart-color)" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <Bar dataKey="total" name="Total" fill="var(--chart-total)" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};


