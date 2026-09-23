'use client';

import React, { useState } from 'react';
import { Download, FileText, Table, BarChart3, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { DashboardKPIs, ContagemDiariaItem, Impressora, TimelineDataPoint, BranchRankingItem } from '@/lib/types';

interface ReportExporterProps {
  kpis: DashboardKPIs | null;
  contagemDiaria: ContagemDiariaItem[];
  impressoras: Impressora[];
  timeline: TimelineDataPoint[];
  branchRanking: BranchRankingItem[];
  hideCurrency: boolean;
}

interface PredefinedReport {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  generate: () => void;
}

export const ReportExporter: React.FC<ReportExporterProps> = ({
  kpis,
  contagemDiaria,
  impressoras,
  timeline,
  branchRanking,
  hideCurrency,
}) => {
  const [open, setOpen] = useState(false);

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
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
  };

  const formatCurrency = (v: number) => hideCurrency ? '***' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const reports: PredefinedReport[] = [
    {
      id: 'resumo-executivo',
      label: 'Resumo Executivo',
      description: 'KPIs gerais + ranking de unidades',
      icon: FileText,
      generate: () => {
        if (!kpis) return;
        const headers = ['Metrica', 'Valor'];
        const rows = [
          ['Total Impresso', `${kpis.totalImpresso} paginas`],
          ['Total P&B', `${kpis.totalPB} paginas`],
          ['Total Color', `${kpis.totalColor} paginas`],
          ['Custo Total', formatCurrency(kpis.custoTotal)],
          ['Proporcao P&B', `${kpis.proporcaoPB}%`],
          ['Proporcao Color', `${kpis.proporcaoColor}%`],
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
      icon: Table,
      generate: () => {
        const headers = ['Unidade', 'Setor/Apelido', 'Serial', 'Modelo', 'IP', 'PB', 'Color', 'Total'];
        const rows = contagemDiaria.map((d) => [
          d.unidadeNome,
          d.apelido || '-',
          d.serial,
          d.modelo,
          d.ip,
          `${d.paginasPBDia}`,
          `${d.paginasColorDia}`,
          `${d.totalDia}`,
        ]);
        downloadCsv('contagem_diaria.csv', headers, rows);
      },
    },
    {
      id: 'parque-impressoras',
      label: 'Parque de Impressoras',
      description: 'Lista completa com deltas e custos',
      icon: FileSpreadsheet,
      generate: () => {
        const headers = ['Unidade', 'Apelido', 'Modelo', 'Serial', 'IP', 'Status', 'PB Delta', 'Color Delta', 'Total', 'Custo Estimado'];
        const rows = impressoras.map((imp) => [
          imp.unidadeNome || '',
          imp.apelido || '-',
          imp.modelo,
          imp.serial,
          imp.ip,
          imp.status,
          `${imp.consumoPBDelta}`,
          `${imp.consumoColorDelta}`,
          `${imp.totalImpresso}`,
          formatCurrency(imp.custoEstimado),
        ]);
        downloadCsv('parque_impressoras.csv', headers, rows);
      },
    },
    {
      id: 'timeline-consumo',
      label: 'Timeline de Consumo',
      description: 'Evolucao diaria PB vs Color',
      icon: BarChart3,
      generate: () => {
        const headers = ['Data', 'PB', 'Color', 'Total', 'Custo'];
        const rows = timeline.map((t) => [
          t.data,
          `${t.paginasPB}`,
          `${t.paginasColor}`,
          `${t.total}`,
          formatCurrency(t.custo),
        ]);
        downloadCsv('timeline_consumo.csv', headers, rows);
      },
    },
    {
      id: 'ranking-filiais',
      label: 'Ranking de Filiais',
      description: 'Consumo por unidade',
      icon: BarChart3,
      generate: () => {
        const headers = ['Unidade', 'PB', 'Color', 'Total', 'Custo'];
        const rows = branchRanking.map((b) => [
          b.unidade,
          `${b.paginasPB}`,
          `${b.paginasColor}`,
          `${b.total}`,
          formatCurrency(b.custo),
        ]);
        downloadCsv('ranking_filiais.csv', headers, rows);
      },
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center space-x-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-750 transition-all cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Extrair Relatorio</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Relatorios Pre-definidos</span>
            </div>
            <div className="py-1 max-h-80 overflow-y-auto">
              {reports.map((report) => {
                const Icon = report.icon;
                return (
                  <button
                    key={report.id}
                    onClick={() => { report.generate(); setOpen(false); }}
                    className="w-full flex items-start space-x-3 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all text-left cursor-pointer"
                  >
                    <div className="p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">{report.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{report.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
