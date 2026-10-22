'use client';

import React from 'react';
import {
  BarChart3, Printer, DollarSign, Send, FileText, LayoutDashboard,
  ChevronLeft, ChevronRight, Printer as PrinterIcon, Download, Sparkles, Settings
} from 'lucide-react';
import { TabType } from './Tabs';
import { DashboardKPIs, ContagemDiariaItem, Impressora, TimelineDataPoint, BranchRankingItem } from '@/lib/types';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  printerCount: number;
  slaPendingCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  kpis: DashboardKPIs | null;
  contagemDiaria: ContagemDiariaItem[];
  impressoras: Impressora[];
  timeline: TimelineDataPoint[];
  branchRanking: BranchRankingItem[];
  hideCurrency: boolean;
  usarSeparacaoCores?: boolean;
  onOpenIA?: () => void;
}

const tabsList: Array<{ id: TabType; label: string; shortLabel: string; icon: React.ElementType; badge?: string; badgeColor?: string }> = [
  { id: 'contagem', label: 'Contagem Diaria', shortLabel: 'Contagem', icon: BarChart3 },
  { id: 'impressoras', label: 'Parque de Impressoras', shortLabel: 'Impressoras', icon: Printer, badgeColor: 'bg-blue-950 text-blue-300 border-blue-800/60' },
  { id: 'financeiro', label: 'Projecoes Financeiras', shortLabel: 'Financeiro', icon: DollarSign },
  { id: 'armazenamento', label: 'Monitor de Envios', shortLabel: 'Envios', icon: Send },
  { id: 'contratos', label: 'Contratos & Aliases', shortLabel: 'Contratos', icon: FileText },
  { id: 'dashboard', label: 'Visao Geral Executiva', shortLabel: 'Dashboard', icon: LayoutDashboard, badgeColor: 'bg-red-900/80 text-red-300 border-red-700/60' },
  { id: 'configuracoes', label: 'Configuracoes', shortLabel: 'Configuracoes', icon: Settings },
];

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [
    '\uFEFF' + headers.join(';'),
    ...rows.map((r) => r.join(';')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  printerCount,
  slaPendingCount,
  collapsed,
  onToggleCollapse,
  kpis,
  contagemDiaria,
  impressoras,
  timeline,
  branchRanking,
  hideCurrency,
  usarSeparacaoCores = true,
  onOpenIA,
}) => {
  const [reportsOpen, setReportsOpen] = React.useState(false);

  const getBadge = (tab: typeof tabsList[0]) => {
    if (tab.id === 'impressoras') return `${printerCount}`;
    if (tab.id === 'dashboard' && slaPendingCount > 0) return `${slaPendingCount}`;
    return null;
  };

  const formatCurrency = (v: number) => hideCurrency ? '***' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const reports = [
    {
      id: 'resumo-executivo',
      label: 'Resumo Executivo',
      description: 'KPIs gerais + ranking de unidades',
      generate: () => {
        if (!kpis) return;
        const headers = ['Metrica', 'Valor'];
        const rows = [
          ['Total Impresso', `${kpis.totalImpresso} paginas`],
          ...(usarSeparacaoCores
            ? [
                ['Total P&B', `${kpis.totalPB} paginas`],
                ['Total Color', `${kpis.totalColor} paginas`],
                ['Proporcao P&B', `${kpis.proporcaoPB}%`],
                ['Proporcao Color', `${kpis.proporcaoColor}%`],
              ]
            : []),
          ['Custo Total', formatCurrency(kpis.custoTotal)],
          ['Unidade Lider', kpis.unidadeLider.nome],
          ['Total Unidade Lider', `${kpis.unidadeLider.total} paginas`],
          ['Impressoras Online', `${kpis.impressorasOnline}`],
          ['Impressoras Offline', `${kpis.impressorasOffline}`],
          ['Reset de Placa', `${kpis.impressorasReset}`],
          ['Unidades Pendentes SLA', `${kpis.unidadesPendentesSLA.length}`],
        ];
        downloadCsv('resumo_executivo.csv', headers, rows);
      },
    },
    {
      id: 'contagem-diaria',
      label: 'Contagem Diaria',
      description: 'Consumo por impressora no periodo',
      generate: () => {
        const headers = usarSeparacaoCores
          ? ['Unidade', 'Setor/Apelido', 'Serial', 'Modelo', 'IP', 'PB', 'Color', 'Total']
          : ['Unidade', 'Setor/Apelido', 'Serial', 'Modelo', 'IP', 'Total'];
        const rows = contagemDiaria.map((d) =>
          usarSeparacaoCores
            ? [d.unidadeNome, d.apelido || '-', d.serial, d.modelo, d.ip, `${d.paginasPBDia}`, `${d.paginasColorDia}`, `${d.totalDia}`]
            : [d.unidadeNome, d.apelido || '-', d.serial, d.modelo, d.ip, `${d.totalDia}`]
        );
        downloadCsv('contagem_diaria.csv', headers, rows);
      },
    },
    {
      id: 'parque-impressoras',
      label: 'Parque de Impressoras',
      description: 'Lista completa com deltas e custos',
      generate: () => {
        const headers = usarSeparacaoCores
          ? ['Unidade', 'Apelido', 'Modelo', 'Serial', 'IP', 'Status', 'PB Delta', 'Color Delta', 'Total', 'Custo Estimado']
          : ['Unidade', 'Apelido', 'Modelo', 'Serial', 'IP', 'Status', 'Total', 'Custo Estimado'];
        const rows = impressoras.map((imp) =>
          usarSeparacaoCores
            ? [imp.unidadeNome || '', imp.apelido || '-', imp.modelo, imp.serial, imp.ip, imp.status, `${imp.consumoPBDelta}`, `${imp.consumoColorDelta}`, `${imp.totalImpresso}`, formatCurrency(imp.custoEstimado)]
            : [imp.unidadeNome || '', imp.apelido || '-', imp.modelo, imp.serial, imp.ip, imp.status, `${imp.totalImpresso}`, formatCurrency(imp.custoEstimado)]
        );
        downloadCsv('parque_impressoras.csv', headers, rows);
      },
    },
    {
      id: 'timeline-consumo',
      label: 'Timeline de Consumo',
      description: 'Evolucao diaria PB vs Color',
      generate: () => {
        const headers = usarSeparacaoCores ? ['Data', 'PB', 'Color', 'Total', 'Custo'] : ['Data', 'Total', 'Custo'];
        const rows = timeline.map((t) =>
          usarSeparacaoCores
            ? [t.data, `${t.paginasPB}`, `${t.paginasColor}`, `${t.total}`, formatCurrency(t.custo)]
            : [t.data, `${t.total}`, formatCurrency(t.custo)]
        );
        downloadCsv('timeline_consumo.csv', headers, rows);
      },
    },
    {
      id: 'ranking-filiais',
      label: 'Ranking de Filiais',
      description: 'Consumo por unidade',
      generate: () => {
        const headers = usarSeparacaoCores ? ['Unidade', 'PB', 'Color', 'Total', 'Custo'] : ['Unidade', 'Total', 'Custo'];
        const rows = branchRanking.map((b) =>
          usarSeparacaoCores
            ? [b.unidade, `${b.paginasPB}`, `${b.paginasColor}`, `${b.total}`, formatCurrency(b.custo)]
            : [b.unidade, `${b.total}`, formatCurrency(b.custo)]
        );
        downloadCsv('ranking_filiais.csv', headers, rows);
      },
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-30 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'px-3'} h-16 border-b border-slate-200 dark:border-slate-700`}>
        <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl text-white shrink-0">
          <PrinterIcon className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="ml-2 overflow-hidden">
            <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">Painel <span className="text-cyan-600 dark:text-cyan-400">BI</span></span>
          </div>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {tabsList.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = getBadge(tab);
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center relative ${collapsed ? 'justify-center' : 'px-3'} py-3 text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/10 to-transparent text-cyan-600 dark:text-cyan-400 border-l-[3px] border-cyan-500 dark:border-cyan-400 shadow-[inset_4px_0_15px_-5px_rgba(34,211,238,0.1)] dark:shadow-[inset_4px_0_15px_-5px_rgba(34,211,238,0.3)]'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-l-[3px] border-transparent'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-cyan-600 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] dark:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-slate-400'}`} />
              {!collapsed && (
                <div className="ml-3 flex-1 flex items-center justify-between min-w-0">
                  <span className="text-xs font-semibold truncate">{tab.shortLabel}</span>
                  {badge && (
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold border rounded-full ${tab.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                      {badge}
                    </span>
                  )}
                </div>
              )}
              {collapsed && badge && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Análise IA */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-2">
        <button
          onClick={() => onOpenIA && onOpenIA()}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'px-3'} py-2.5 text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-600/10 rounded-lg transition-all cursor-pointer`}
          title={collapsed ? 'Análise da IA' : undefined}
        >
          <Sparkles className="w-5 h-5 shrink-0" />
          {!collapsed && (
            <span className="ml-3 text-xs font-semibold text-slate-700 dark:text-slate-300">Análise da IA</span>
          )}
        </button>
      </div>

      {/* Extrair Relatorio */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-2">
        <div className="relative">
          <button
            onClick={() => setReportsOpen(!reportsOpen)}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'px-3'} py-2.5 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer`}
            title={collapsed ? 'Extrair Relatorio' : undefined}
          >
            <Download className="w-5 h-5 shrink-0" />
            {!collapsed && (
              <span className="ml-3 text-xs font-semibold text-slate-700 dark:text-slate-300">Extrair Relatorio</span>
            )}
          </button>

            {reportsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setReportsOpen(false)} />
              <div className="absolute left-full bottom-0 ml-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Relatorios Pre-definidos</span>
                </div>
                <div className="py-1 max-h-80 overflow-y-auto">
                  {reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => { report.generate(); setReportsOpen(false); }}
                      className="w-full flex items-start space-x-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all text-left cursor-pointer"
                    >
                      <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg mt-0.5">
                        <Download className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">{report.label}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300 truncate">{report.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggleCollapse}
        className="h-10 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
};
