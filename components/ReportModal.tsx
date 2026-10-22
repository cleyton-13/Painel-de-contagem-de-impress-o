'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, FileSpreadsheet, Calendar, Building2, CheckCircle2, 
  Clock, DollarSign, Palette, Package, AlertTriangle, FileText, X, ArrowRight
} from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReportOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  badge: string;
  badgeColor: string;
}

const REPORT_OPTIONS: ReportOption[] = [
  {
    id: 'sla_conformidade',
    label: 'Auditoria de SLA & Pontualidade',
    description: 'Conformidade por clínica (% no prazo até 17h, dias atrasados e pendências de leitura).',
    icon: Clock,
    badge: 'Operacional',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'franquia_financeiro',
    label: 'Fechamento Financeiro & Franquias',
    description: 'Consumo real vs Cota contratada, cálculo de excedente PB/Color em R$ e fatura final.',
    icon: DollarSign,
    badge: 'Financeiro',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  {
    id: 'auditoria_color',
    label: 'Auditoria Color vs P&B (Desperdício)',
    description: 'Proporção de impressões coloridas por impressora e economia potencial se impressas em PB.',
    icon: Palette,
    badge: 'Custos',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  {
    id: 'consumo_papel',
    label: 'Consumo de Papel & Insumos',
    description: 'Consumo físico de resmas (500 pags) e caixas (5.000 pags) com base em R$ 28/resma.',
    icon: Package,
    badge: 'Suprimentos',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  {
    id: 'parque_anomalias',
    label: 'Diagnóstico do Parque & Anomalias',
    description: 'Detecção de resets de placa lógica, impressoras estagnadas/offline e vida útil.',
    icon: AlertTriangle,
    badge: 'Auditoria TI',
    badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  {
    id: 'extrato_detalhado',
    label: 'Extrato Analítico Completo',
    description: 'Relatório linha a linha com todas as leituras, datas, seriais e contadores para auditoria.',
    icon: FileText,
    badge: 'Contábil',
    badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
];

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose }) => {
  const [mounted, setMounted] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string>('sla_conformidade');
  const [periodo, setPeriodo] = useState<string>('30dias');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [selectedUnidade, setSelectedUnidade] = useState<string>('ALL');
  const [unidades, setUnidades] = useState<Array<{ id: string; nome: string }>>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/unidades')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setUnidades(data);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set('tipo', selectedReport);
      params.set('periodo', periodo);
      if (selectedUnidade && selectedUnidade !== 'ALL') {
        params.set('unidadeId', selectedUnidade);
      }
      if (periodo === 'custom') {
        if (dataInicio) params.set('dataInicio', dataInicio);
        if (dataFim) params.set('dataFim', dataFim);
      }

      const url = `/api/relatorios/exportar?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition');
      let filename = `relatorio_${selectedReport}_${periodo}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      onClose();
    } catch (err) {
      alert(`Falha ao exportar relatório: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const modalJSX = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Central de Extração de Relatórios</h3>
              <p className="text-xs text-slate-400">Exporte dados analíticos formatados para Excel e BI.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. Seleção do Relatório */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-3">
              1. Escolha o Relatório Desejado
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {REPORT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = selectedReport === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedReport(opt.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      selected
                        ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500/50 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800/80 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-2 rounded-lg ${selected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-200">{opt.label}</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${opt.badgeColor}`}>
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed pl-1">
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Filtros de Período e Unidade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-800/80">
            
            {/* Período */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                2. Período Selecionável
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                {[
                  { id: 'hoje', label: 'Hoje' },
                  { id: '7dias', label: '7 Dias' },
                  { id: '15dias', label: '15 Dias' },
                  { id: '30dias', label: '30 Dias' },
                  { id: 'mes_atual', label: 'Mês Atual' },
                  { id: 'mes_anterior', label: 'Mês Anterior' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodo(p.id)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      periodo === p.id
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPeriodo('custom')}
                className={`w-full py-1.5 px-3 rounded-lg text-xs font-medium border transition-all cursor-pointer mb-2.5 ${
                  periodo === 'custom'
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                }`}
              >
                Definir Intervalo de Datas Personalizado...
              </button>

              {periodo === 'custom' && (
                <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">De:</span>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Até:</span>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Unidade */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                3. Filtrar por Unidade
              </label>
              <select
                value={selectedUnidade}
                onChange={(e) => setSelectedUnidade(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer mb-3"
              >
                <option value="ALL">Todas as Unidades ({unidades.length})</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>

              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Formato Pronto para Excel:
                </div>
                <p>O arquivo é gerado com delimitador padrão brasileiro (ponto e vírgula <code>;</code>) e codificação <code>UTF-8 BOM</code>, abrindo perfeitamente no Excel sem erros de acentuação.</p>
              </div>
            </div>

          </div>

        </div>

        {/* Footer Modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Relatório selecionado: <strong className="text-white">{REPORT_OPTIONS.find(o => o.id === selectedReport)?.label}</strong>
          </span>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/30 flex items-center space-x-2 transition-all cursor-pointer"
            >
              {downloading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Gerando Relatório...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar Relatório (Excel / CSV)</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
};
