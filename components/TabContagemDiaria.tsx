'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Table, BarChart3, LayoutGrid, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Loader2 } from 'lucide-react';
import { ContagemDiariaItem, ContagemDiariaAgrupada, ContagemDiariaDiaItem, MonitorEnviosPayload } from '@/lib/types';
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
  data, periodo = '30dias', unidadeId = 'ALL', usarSeparacaoCores = true, monitorEnvios }) => {
  const { palette } = useTheme();
  void palette; // assina o contexto: trocar a paleta re-renderiza e os gráficos releem as vars
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

  // Ordem alfabética: unidade → setor/apelido (ou serial) — usada nas tabelas e no gráfico
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) =>
      a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR') ||
      (a.apelido || a.serial).localeCompare(b.apelido || b.serial, 'pt-BR')
    );
  }, [data]);

  const totais = useMemo(() => {
    let pb = 0, col = 0, pbTotal = 0, colTotal = 0;
    data.forEach((d) => { pb += d.paginasPBDia; col += d.paginasColorDia; pbTotal += d.paginasPBTotal; colTotal += d.paginasColorTotal; });
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

  const perUnitData = useMemo(() => {
    const byUnit = new Map<string, { pb: number; col: number; pbTotal: number; colTotal: number; count: number }>();
    data.forEach((d) => {
      const cur = byUnit.get(d.unidadeNome) || { pb: 0, col: 0, pbTotal: 0, colTotal: 0, count: 0 };
      cur.pb += d.paginasPBTotal;
      cur.col += d.paginasColorTotal;
      cur.pbTotal += d.paginasPBTotal;
      cur.colTotal += d.paginasColorTotal;
      cur.count++;
      byUnit.set(d.unidadeNome, cur);
    });
    return [...byUnit.entries()].map(([nome, v]) => ({
      unidade: nome,
      pb: v.pb,
      col: v.col,
      total: v.pb + v.col,
      pbTotal: v.pbTotal,
      colTotal: v.colTotal,
      totalPeriodo: v.pbTotal + v.colTotal,
      count: v.count,
    })).sort((a, b) => b.total - a.total);
  }, [data]);



  // Busca dados diários quando expande uma unidade
  useEffect(() => {
    if (!expandedUnit) {
      setDiasData([]);
      return;
    }
    setLoadingDias(true);
    const unit = perUnitData.find((u) => u.unidade === expandedUnit);
    if (!unit) { setLoadingDias(false); return; }
    const unidadeParam = unidadeId && unidadeId !== 'ALL' ? `&unidadeId=${encodeURIComponent(unidadeId)}` : '';
    fetch(`/api/contagem-diaria?periodo=${periodo}&comDias=true${unidadeParam}`)
      .then((r) => r.json())
      .then((all: ContagemDiariaAgrupada[]) => {
        const filtered = all.filter((d) => d.unidadeNome === expandedUnit);
        setDiasData(filtered);
        setLoadingDias(false);
      })
      .catch(() => setLoadingDias(false));
  }, [expandedUnit, periodo, perUnitData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Contagem Diaria de Impressoes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
            {data.length} impressoras  {unidades.length} unidades
          </p>
          <div className="flex gap-4 mt-2 text-sm">
            {usarSeparacaoCores && (
              <>
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">PB: {formatBR(totais.pbTotal)}</span>
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
            { id: 'grafico' as ViewMode, label: 'Grafico', icon: BarChart3 },
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

      {/* Modo Tabela — com expand por unidade */}
      {mode === 'tabela' && (
        <div className="glass-panel rounded-xl overflow-hidden relative max-h-[800px] flex flex-col">
          <div className="overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 dark:bg-slate-800/80 backdrop-blur-md text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left font-semibold w-8"></th>
                  <th className="px-4 py-3 text-left font-semibold">Unidade</th>
                  <th className="px-4 py-3 text-left font-semibold">Setor / Apelido</th>
                  <th className="px-4 py-3 text-left font-semibold">Serial</th>
                  <th className="px-4 py-3 text-left font-semibold">Modelo</th>
                  <th className="px-4 py-3 text-left font-semibold">IP</th>
                  {usarSeparacaoCores && (
                    <>
                      <th className="px-4 py-3 text-right font-semibold">PB</th>
                      <th className="px-4 py-3 text-right font-semibold">Color</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((item, idx) => {
                  const isExpanded = expandedUnit === item.unidadeNome;
                  // Só mostra a linha da unidade uma vez (agrupa por unidadeNome)
                  const isFirstOfUnit = idx === 0 || sortedData[idx - 1].unidadeNome !== item.unidadeNome;
                  if (!isFirstOfUnit && !isExpanded) return null;

                  return (
                    <React.Fragment key={`unit-${item.unidadeNome}-${idx}`}>
                      <tr
                        onClick={() => setExpandedUnit(isExpanded ? null : item.unidadeNome)}
                        className="border-b border-slate-200 dark:border-slate-700 even:bg-slate-50 dark:even:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                      >
                        <td className="px-2 py-2.5 text-slate-400 dark:text-slate-400">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col">
                            <span className="text-slate-900 dark:text-white font-semibold">{item.unidadeNome}</span>
                            {!isExpanded && (() => {
                              const env = monitorEnvios?.unidades.find(u => u.unidadeNome === item.unidadeNome);
                              if (!env || !env.dataUltimoEnvio) return null;
                              return (
                                <span className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                                  Último envio: {formatDateTimeBR(env.dataUltimoEnvio)}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300">{isExpanded ? '' : (item.apelido || '—')}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300 font-mono">{isExpanded ? '' : item.serial}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300">{isExpanded ? '' : item.modelo}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300 font-mono">{isExpanded ? '' : item.ip}</td>
                        {usarSeparacaoCores && (
                          <>
                            <td className="px-4 py-2.5 text-right text-cyan-600 dark:text-cyan-400 font-semibold">
                              {isExpanded
                                ? formatBR(diasData.reduce((s, d) => s + d.paginasPBDia, 0))
                                : formatBR(item.paginasPBTotal)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-purple-600 dark:text-purple-400 font-semibold">
                              {isExpanded
                                ? formatBR(diasData.reduce((s, d) => s + d.paginasColorDia, 0))
                                : formatBR(item.paginasColorTotal)}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-2.5 text-right text-slate-900 dark:text-white font-bold">
                          {isExpanded
                            ? formatBR(diasData.reduce((s, d) => s + d.totalDia, 0))
                            : formatBR(item.totalPeriodo)}
                        </td>
                      </tr>
                      {/* Linhas expandidas — detalhe diário */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={usarSeparacaoCores ? 9 : 7} className="p-0">
                            <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-b border-slate-200 dark:border-slate-700">
                              {loadingDias ? (
                                <div className="flex items-center justify-center py-6 gap-2 text-slate-400 dark:text-slate-400">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Carregando detalhes...
                                </div>
                              ) : diasData.length === 0 ? (
                                <div className="py-6 text-center text-slate-400 dark:text-slate-400 text-xs">Nenhum dado diario encontrado</div>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 dark:text-slate-400">
                                      <th className="px-4 py-2 text-left font-medium">Data</th>
                                      <th className="px-4 py-2 text-left font-medium">Setor / Apelido</th>
                                      <th className="px-4 py-2 text-left font-medium">Serial</th>
                                      <th className="px-4 py-2 text-left font-medium">Modelo</th>
                                      <th className="px-4 py-2 text-left font-medium">IP</th>
                                      {usarSeparacaoCores && (
                                        <>
                                          <th className="px-4 py-2 text-right font-medium">PB</th>
                                          <th className="px-4 py-2 text-right font-medium">Color</th>
                                        </>
                                      )}
                                      <th className="px-4 py-2 text-right font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {diasData.map((imp) =>
                                      imp.dias.slice().reverse().map((dia) => (
                                        <tr key={`${dia.serial}-${dia.data}`} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50">
                                          <td className="px-4 py-1.5 font-mono text-slate-700 dark:text-slate-300">Dia {formatDateBR(dia.data)}</td>
                                          <td className="px-4 py-1.5 text-slate-600 dark:text-slate-300">{dia.apelido || '—'}</td>
                                          <td className="px-4 py-1.5 text-slate-600 dark:text-slate-300 font-mono">{dia.serial}</td>
                                          <td className="px-4 py-1.5 text-slate-500 dark:text-slate-400">{dia.modelo}</td>
                                          <td className="px-4 py-1.5 text-slate-500 dark:text-slate-400 font-mono">{dia.ip}</td>
                                          {usarSeparacaoCores && (
                                            <>
                                              <td className="px-4 py-1.5 text-right text-cyan-600 dark:text-cyan-400 font-semibold">{formatBR(dia.paginasPB)}</td>
                                              <td className="px-4 py-1.5 text-right text-purple-600 dark:text-purple-400 font-semibold">{formatBR(dia.paginasColor)}</td>
                                            </>
                                          )}
                                          <td className="px-4 py-1.5 text-right text-slate-900 dark:text-white font-bold">{formatBR(dia.total)}</td>
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={usarSeparacaoCores ? 9 : 7} className="px-4 py-8 text-center text-slate-400 dark:text-slate-400">Nenhum dado disponivel</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* Modo Grafico */}
      {mode === 'grafico' && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-4">
            {usarSeparacaoCores ? 'Consumo por Impressora (PB + Color)' : 'Consumo por Impressora (Total)'}
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
              <XAxis dataKey="name" tick={{ fill: chartAxis, fontSize: 12 }} />
              <YAxis tick={{ fill: chartAxis, fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', color: tooltipColor }}
                labelStyle={{ color: tooltipColor }}
              />
              <Legend />
              {usarSeparacaoCores ? (
                <>
                  <Bar dataKey="PB" stackId="a" fill="var(--chart-pb-alt)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Color" stackId="a" fill="var(--chart-color-alt)" radius={[4, 4, 0, 0]} />
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
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="name" tick={{ fill: chartAxis, fontSize: 12 }} />
                <YAxis tick={{ fill: chartAxis, fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', color: tooltipColor }}
                  labelStyle={{ color: tooltipColor }}
                />
                <Legend />
                {usarSeparacaoCores ? (
                  <>
                    <Bar dataKey="PB" stackId="a" fill="var(--chart-pb-alt)" />
                    <Bar dataKey="Color" stackId="a" fill="var(--chart-color-alt)" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <Bar dataKey="Total" fill="var(--chart-total)" radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-4">Detalhamento por Impressora</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <th className="px-4 py-2 text-left font-semibold">Unidade</th>
                    <th className="px-4 py-2 text-left font-semibold">Setor / Apelido</th>
                    <th className="px-4 py-2 text-left font-semibold">Serial</th>
                    <th className="px-4 py-2 text-left font-semibold">Modelo</th>
                    <th className="px-4 py-2 text-left font-semibold">IP</th>
                    {usarSeparacaoCores && (
                      <>
                        <th className="px-4 py-2 text-right font-semibold">PB</th>
                        <th className="px-4 py-2 text-right font-semibold">Color</th>
                      </>
                    )}
                    <th className="px-4 py-2 text-right font-semibold">Total do Período</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((d, idx) => (
                    <tr key={`${d.serial}-${idx}`} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2.5 text-slate-900 dark:text-slate-300">{d.unidadeNome}</td>
                      <td className="px-4 py-2.5 text-cyan-600 dark:text-cyan-300 font-semibold">{d.apelido || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200 font-mono">{d.serial}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300">{d.modelo}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-300 font-mono">{d.ip}</td>
                      {usarSeparacaoCores && (
                        <>
                          <td className="px-4 py-2.5 text-right text-cyan-600 dark:text-cyan-400 font-semibold">{formatBR(d.paginasPBTotal)}</td>
                          <td className="px-4 py-2.5 text-right text-purple-600 dark:text-purple-400 font-semibold">{formatBR(d.paginasColorTotal)}</td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-right text-slate-900 dark:text-white font-bold">{formatBR(d.totalPeriodo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300 mb-4">Resumo por Unidade</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {perUnitData.map((u) => (
                <div key={u.unidade} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm dark:shadow-none hover:border-cyan-500/30 transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{u.unidade}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-400">({u.count} impressoras)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {usarSeparacaoCores && (
                      <>
                        <div>
                          <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{formatBR(u.pb)}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-400 uppercase">PB</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{formatBR(u.col)}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-400 uppercase">Color</div>
                        </div>
                      </>
                    )}
                    <div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">{formatBR(u.total)}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-400 uppercase">Total do Período</div>
                    </div>
                    {!usarSeparacaoCores && (
                      <div className="col-span-1" />
                    )}
                  </div>
                </div>
              ))}
              {perUnitData.length === 0 && (
                <p className="text-slate-400 dark:text-slate-400 text-sm col-span-full text-center py-4">Nenhum dado disponivel</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
