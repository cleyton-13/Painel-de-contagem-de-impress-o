'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Table, BarChart3, LayoutGrid, ChevronDown, ChevronRight as ChevronRightIcon, Loader2 } from 'lucide-react';
import { ContagemDiariaItem, ContagemDiariaAgrupada, MonitorEnviosPayload } from '@/lib/types';
import { useTheme } from './ThemeContext';
import { chartTheme } from '@/lib/chartTheme';

type ViewMode = 'tabela' | 'grafico' | 'completo';

interface TabContagemDiariaProps {
  data: ContagemDiariaItem[];
  periodo?: string;
  unidadeId?: string;
  usarSeparacaoCores?: boolean;
  monitorEnvios?: MonitorEnviosPayload | null;
}

function formatBR(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTimeBR(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

export const TabContagemDiaria: React.FC<TabContagemDiariaProps> = ({
  data,
  periodo = '30dias',
  unidadeId = 'ALL',
  usarSeparacaoCores = true,
  monitorEnvios,
}) => {
  const { palette } = useTheme();
  void palette;

  const chartGrid = chartTheme.grid();
  const chartAxis = chartTheme.axis();
  const tooltipBg = chartTheme.tooltipBg();
  const tooltipBorder = chartTheme.tooltipBorder();
  const tooltipColor = chartTheme.tooltipColor();

  const [mode, setMode] = useState<ViewMode>('tabela');
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [diasData, setDiasData] = useState<ContagemDiariaAgrupada[]>([]);
  const [loadingDias, setLoadingDias] = useState(false);

  const unidades = useMemo(() => [...new Set(data.map((d) => d.unidadeNome))].sort(), [data]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) =>
      a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR') ||
      (a.apelido || a.serial).localeCompare(b.apelido || b.serial, 'pt-BR')
    );
  }, [data]);

  const totais = useMemo(() => {
    let pb = 0, col = 0, pbTotal = 0, colTotal = 0;
    data.forEach((d) => {
      pb += d.paginasPBDia;
      col += d.paginasColorDia;
      pbTotal += d.paginasPBTotal;
      colTotal += d.paginasColorTotal;
    });
    return { pb, col, total: pb + col, pbTotal, colTotal, totalPeriodo: pbTotal + colTotal };
  }, [data]);

  const chartData = useMemo(() => {
    return sortedData.map((d) => ({
      name: d.apelido || d.serial,
      ...(usarSeparacaoCores
        ? { 'PB': d.paginasPBTotal, 'Color': d.paginasColorTotal }
        : { 'Total': d.paginasPBTotal + d.paginasColorTotal }),
    }));
  }, [sortedData, usarSeparacaoCores]);

  // Agrupamento consolidado por Unidade
  const perUnitData = useMemo(() => {
    const byUnit = new Map<string, {
      unidadeId: string;
      pbTotal: number;
      colTotal: number;
      printers: ContagemDiariaItem[];
    }>();

    data.forEach((d) => {
      const cur = byUnit.get(d.unidadeNome) || {
        unidadeId: d.unidadeId,
        pbTotal: 0,
        colTotal: 0,
        printers: [],
      };
      cur.pbTotal += d.paginasPBTotal;
      cur.colTotal += d.paginasColorTotal;
      cur.printers.push(d);
      byUnit.set(d.unidadeNome, cur);
    });

    return [...byUnit.entries()].map(([nome, v]) => ({
      unidade: nome,
      unidadeId: v.unidadeId,
      pbTotal: v.pbTotal,
      colTotal: v.colTotal,
      totalPeriodo: v.pbTotal + v.colTotal,
      count: v.printers.length,
      printers: v.printers,
    })).sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'));
  }, [data]);

  // Busca dados diários quando o usuário clica para expandir uma unidade
  useEffect(() => {
    if (!expandedUnit) {
      return;
    }

    const controller = new AbortController();
    const unidadeParam = unidadeId && unidadeId !== 'ALL' ? `&unidadeId=${encodeURIComponent(unidadeId)}` : '';

    fetch(`/api/contagem-diaria?periodo=${periodo}&comDias=true${unidadeParam}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((all: ContagemDiariaAgrupada[]) => {
        if (Array.isArray(all)) {
          const filtered = all.filter((d) => d.unidadeNome === expandedUnit);
          setDiasData(filtered);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('Falha ao buscar dias da unidade:', err);
        }
      })
      .finally(() => {
        setLoadingDias(false);
      });

    return () => controller.abort();
  }, [expandedUnit, periodo, unidadeId]);

  const handleToggleExpand = (nome: string) => {
    if (expandedUnit === nome) {
      setExpandedUnit(null);
      setDiasData([]);
    } else {
      setLoadingDias(true);
      setExpandedUnit(nome);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Contagem Diária de Impressões</h2>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
            {data.length} impressoras · {unidades.length} unidades
          </p>
          <div className="flex gap-4 mt-2 text-sm">
            {usarSeparacaoCores && (
              <>
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">P&B: {formatBR(totais.pbTotal)}</span>
                <span className="text-purple-600 dark:text-purple-400 font-semibold">Color: {formatBR(totais.colTotal)}</span>
              </>
            )}
            <span className="text-slate-900 dark:text-white font-bold">Total do Período: {formatBR(totais.totalPeriodo)}</span>
          </div>
          {monitorEnvios?.registros?.[0] && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Último processamento: {formatDateTimeBR(monitorEnvios.registros[0].dataProcessamento)}
            </div>
          )}
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {([
            { id: 'tabela' as ViewMode, label: 'Tabela', icon: Table },
            { id: 'grafico' as ViewMode, label: 'Gráfico', icon: BarChart3 },
            { id: 'completo' as ViewMode, label: 'Completo', icon: LayoutGrid },
          ]).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  mode === m.id ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modo Tabela — Agrupado por Unidade sem duplicações */}
      {mode === 'tabela' && (
        <div className="glass-panel rounded-xl overflow-hidden relative max-h-[800px] flex flex-col">
          <div className="overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 dark:bg-slate-800/80 backdrop-blur-md text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left font-semibold w-8"></th>
                  <th className="px-4 py-3 text-left font-semibold">Unidade</th>
                  <th className="px-4 py-3 text-left font-semibold">Equipamentos</th>
                  {usarSeparacaoCores && (
                    <>
                      <th className="px-4 py-3 text-right font-semibold">Total P&B</th>
                      <th className="px-4 py-3 text-right font-semibold">Total Color</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right font-semibold">Total do Período</th>
                </tr>
              </thead>
              <tbody>
                {perUnitData.map((unit) => {
                  const isExpanded = expandedUnit === unit.unidade;
                  const env = monitorEnvios?.unidades.find((u) => u.unidadeNome === unit.unidade);

                  return (
                    <React.Fragment key={`unit-${unit.unidade}`}>
                      <tr
                        onClick={() => handleToggleExpand(unit.unidade)}
                        className="border-b border-slate-200 dark:border-slate-700 even:bg-slate-50/50 dark:even:bg-slate-800/50 hover:bg-slate-100/70 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-3 text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-slate-900 dark:text-white font-bold text-sm">{unit.unidade}</span>
                            {env?.dataUltimoEnvio && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                Último envio: {formatDateTimeBR(env.dataUltimoEnvio)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {unit.count} {unit.count === 1 ? 'impressora' : 'impressoras'}
                        </td>
                        {usarSeparacaoCores && (
                          <>
                            <td className="px-4 py-3 text-right text-cyan-600 dark:text-cyan-400 font-mono font-semibold">
                              {formatBR(unit.pbTotal)}
                            </td>
                            <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400 font-mono font-semibold">
                              {formatBR(unit.colTotal)}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right text-slate-900 dark:text-white font-mono font-bold text-sm">
                          {formatBR(unit.totalPeriodo)}
                        </td>
                      </tr>

                      {/* Bloco expandido — Único bloco por Unidade com detalhe diário e por impressora */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={usarSeparacaoCores ? 6 : 4} className="p-0">
                            <div className="bg-slate-50/90 dark:bg-slate-900/90 border-t border-b border-slate-200 dark:border-slate-700 p-4 space-y-4">
                              {/* Subtabela de Impressoras da Unidade */}
                              <div>
                                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                                  Equipamentos Cadastrados na Unidade ({unit.printers.length})
                                </h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                                        <th className="px-3 py-2 text-left font-semibold">Setor / Apelido</th>
                                        <th className="px-3 py-2 text-left font-semibold">Serial</th>
                                        <th className="px-3 py-2 text-left font-semibold">Modelo</th>
                                        <th className="px-3 py-2 text-left font-semibold">IP</th>
                                        {usarSeparacaoCores && (
                                          <>
                                            <th className="px-3 py-2 text-right font-semibold">P&B</th>
                                            <th className="px-3 py-2 text-right font-semibold">Color</th>
                                          </>
                                        )}
                                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                      {unit.printers.map((p) => (
                                        <tr key={p.serial} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                          <td className="px-3 py-2 font-semibold text-cyan-600 dark:text-cyan-300">{p.apelido || '—'}</td>
                                          <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{p.serial}</td>
                                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.modelo}</td>
                                          <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{p.ip}</td>
                                          {usarSeparacaoCores && (
                                            <>
                                              <td className="px-3 py-2 text-right font-mono text-cyan-600 dark:text-cyan-400">{formatBR(p.paginasPBTotal)}</td>
                                              <td className="px-3 py-2 text-right font-mono text-purple-600 dark:text-purple-400">{formatBR(p.paginasColorTotal)}</td>
                                            </>
                                          )}
                                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">{formatBR(p.totalPeriodo)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Histórico Diário Detalhado */}
                              <div>
                                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                                  Histórico Diário de Leituras
                                </h4>
                                {loadingDias ? (
                                  <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Carregando histórico diário...</span>
                                  </div>
                                ) : diasData.length === 0 ? (
                                  <div className="py-4 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                    Nenhum dado diário detalhado encontrado para este período.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                                          <th className="px-3 py-2 text-left font-semibold">Data</th>
                                          <th className="px-3 py-2 text-left font-semibold">Setor / Apelido</th>
                                          <th className="px-3 py-2 text-left font-semibold">Serial</th>
                                          {usarSeparacaoCores && (
                                            <>
                                              <th className="px-3 py-2 text-right font-semibold">P&B</th>
                                              <th className="px-3 py-2 text-right font-semibold">Color</th>
                                            </>
                                          )}
                                          <th className="px-3 py-2 text-right font-semibold">Total do Dia</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                        {diasData.flatMap((imp) =>
                                          imp.dias.map((dia) => (
                                            <tr key={`${dia.serial}-${dia.data}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                              <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300">{formatDateBR(dia.data)}</td>
                                              <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{dia.apelido || '—'}</td>
                                              <td className="px-3 py-1.5 font-mono text-slate-500 dark:text-slate-400">{dia.serial}</td>
                                              {usarSeparacaoCores && (
                                                <>
                                                  <td className="px-3 py-1.5 text-right font-mono text-cyan-600 dark:text-cyan-400">{formatBR(dia.paginasPB)}</td>
                                                  <td className="px-3 py-1.5 text-right font-mono text-purple-600 dark:text-purple-400">{formatBR(dia.paginasColor)}</td>
                                                </>
                                              )}
                                              <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-900 dark:text-white">{formatBR(dia.total)}</td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {perUnitData.length === 0 && (
                  <tr>
                    <td colSpan={usarSeparacaoCores ? 6 : 4} className="px-4 py-8 text-center text-slate-400">
                      Nenhum dado disponível para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modo Gráfico */}
      {mode === 'grafico' && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-4">
            {usarSeparacaoCores ? 'Consumo por Impressora (P&B + Color)' : 'Consumo por Impressora (Total)'}
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(400, Math.min(sortedData.length * 28, 800))}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
              <XAxis dataKey="name" tick={{ fill: chartAxis, fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: chartAxis, fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', color: tooltipColor }}
                labelStyle={{ color: tooltipColor }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              {usarSeparacaoCores ? (
                <>
                  <Bar dataKey="PB" name="P&B" stackId="a" fill="var(--chart-pb-alt)" />
                  <Bar dataKey="Color" name="Color" stackId="a" fill="var(--chart-color-alt)" radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="Total" fill="var(--chart-total)" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Modo Completo */}
      {mode === 'completo' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-4">Consumo por Impressora (Total do Período)</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="name" tick={{ fill: chartAxis, fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: chartAxis, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', color: tooltipColor }}
                  labelStyle={{ color: tooltipColor }}
                />
                <Legend />
                {usarSeparacaoCores ? (
                  <>
                    <Bar dataKey="PB" name="P&B" stackId="a" fill="var(--chart-pb-alt)" />
                    <Bar dataKey="Color" name="Color" stackId="a" fill="var(--chart-color-alt)" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <Bar dataKey="Total" fill="var(--chart-total)" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-4">Resumo Consolidado por Unidade</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {perUnitData.map((u) => (
                <div key={u.unidade} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm dark:shadow-none hover:border-cyan-500/40 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{u.unidade}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">({u.count} {u.count === 1 ? 'imp.' : 'imp.'})</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {usarSeparacaoCores && (
                      <>
                        <div>
                          <div className="text-base font-bold text-cyan-600 dark:text-cyan-400 font-mono">{formatBR(u.pbTotal)}</div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">P&B</div>
                        </div>
                        <div>
                          <div className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono">{formatBR(u.colTotal)}</div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Color</div>
                        </div>
                      </>
                    )}
                    <div>
                      <div className="text-base font-bold text-slate-900 dark:text-white font-mono">{formatBR(u.totalPeriodo)}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Total</div>
                    </div>
                  </div>
                </div>
              ))}
              {perUnitData.length === 0 && (
                <p className="text-slate-400 text-sm col-span-full text-center py-4">Nenhum dado disponível</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
