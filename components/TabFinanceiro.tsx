'use client';

import React from 'react';
import { Calendar } from 'lucide-react';
import { FinancialProjection, DashboardKPIs } from '@/lib/types';

interface TabFinanceiroProps {
  projections: FinancialProjection[];
  kpis: DashboardKPIs;
  showProjections?: boolean;
  showFranchise?: boolean;
  hideCurrency?: boolean;
  usarSeparacaoCores?: boolean;
}

export const TabFinanceiro: React.FC<TabFinanceiroProps> = ({
  projections,
  kpis,
  usarSeparacaoCores = true,
}) => {
  // Franquia allowance status (e.g. 50,000 PB pages allowance across company)
  const cotaEmpresaPB = 45000;
  const cotaEmpresaColor = 10000;
  const pctPB = Math.min(Math.round((kpis.totalPB / cotaEmpresaPB) * 100), 100);
  const pctColor = Math.min(Math.round((kpis.totalColor / cotaEmpresaColor) * 100), 100);

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Allowance Usage Thermometers / Meters */}
      {usarSeparacaoCores ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Termômetro P&B */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Uso da Cota Inclusa P&B (Franquia Mensal)</h3>
            </div>
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
              {kpis.totalPB.toLocaleString('pt-BR')} / {cotaEmpresaPB.toLocaleString('pt-BR')} pág.
            </span>
          </div>
          <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
            <div
              style={{ width: `${pctPB}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                pctPB > 90 ? 'bg-red-500' : pctPB > 75 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Consumido: <strong className="text-slate-900 dark:text-white">{pctPB}%</strong></span>
            <span>Cota restante: <strong className="text-emerald-600 dark:text-emerald-400">{(cotaEmpresaPB - kpis.totalPB).toLocaleString('pt-BR')} pág.</strong></span>
          </div>
        </div>

        {/* Termômetro Color */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-pink-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Uso da Cota Inclusa Color (Franquia Mensal)</h3>
            </div>
            <span className="text-xs font-mono font-bold text-pink-600 dark:text-pink-400">
              {kpis.totalColor.toLocaleString('pt-BR')} / {cotaEmpresaColor.toLocaleString('pt-BR')} pág.
            </span>
          </div>
          <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
            <div
              style={{ width: `${pctColor}%` }}
              className={`h-full rounded-full transition-all duration-500 ${
                pctColor > 90 ? 'bg-red-500' : pctColor > 75 ? 'bg-amber-500' : 'bg-pink-500'
              }`}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Consumido: <strong className="text-slate-900 dark:text-white">{pctColor}%</strong></span>
            <span>Cota restante: <strong className="text-emerald-600 dark:text-emerald-400">{(cotaEmpresaColor - kpis.totalColor).toLocaleString('pt-BR')} pág.</strong></span>
          </div>
        </div>

        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-2xl p-5 shadow-lg">
          <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-xl text-xs leading-relaxed font-medium space-y-1">
            <p className="font-bold text-amber-900 dark:text-amber-100">Cotas P&B/Color indisponíveis:</p>
            <p>Com a separação de cores desativada, a contagem usa apenas o odômetro <strong>Paginas_Total</strong>.</p>
            <p>As cotas de franquia por tipo (P&B/Color) são ocultadas até a separação de cores ser reativada.</p>
          </div>
        </div>
      )}

      {/* Projections Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Tabela de Projeção de Gastos em R$</h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">Estimativas financeiras baseadas no histórico atual de impressões</p>
          </div>
          <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-bold">
            Simulação Orçamentária
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Período</th>
                {usarSeparacaoCores ? (
                  <>
                    <th className="py-3.5 px-4 text-right">Est. Páginas P&B</th>
                    <th className="py-3.5 px-4 text-right">Est. Páginas Color</th>
                    <th className="py-3.5 px-4 text-right">Custo P&B (R$)</th>
                    <th className="py-3.5 px-4 text-right">Custo Color (R$)</th>
                  </>
                ) : (
                  <th className="py-3.5 px-4 text-right">Est. Páginas Total</th>
                )}
                <th className="py-3.5 px-4 text-right">Franquia Fixa (R$)</th>
                <th className="py-3.5 px-4 text-right bg-emerald-50 dark:bg-slate-800/90 font-extrabold text-emerald-700 dark:text-emerald-400">Total Impressões (R$)</th>
                <th className="py-3.5 px-4 text-right">Resmas Papel (500fl)</th>
                <th className="py-3.5 px-4 text-right">Caixas Papel (5 resmas)</th>
                <th className="py-3.5 px-4 text-right">Custo Insumos Papel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-200 font-medium">
              {projections.map((p) => (
                <tr key={p.periodo} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  
                  {/* Period Name */}
                  <td className="py-4 px-4 font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span>{p.periodo} ({p.dias} {p.dias === 1 ? 'dia' : 'dias'})</span>
                  </td>

                  {/* Est páginas (P&B + Color ou Total) */}
                  {usarSeparacaoCores ? (
                    <>
                      <td className="py-4 px-4 text-right font-mono text-blue-600 dark:text-blue-400">
                        {p.paginasEstimadasPB.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-pink-600 dark:text-pink-400">
                        {p.paginasEstimadasColor.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        R$ {p.custoEstimadoPB.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        R$ {p.custoEstimadoColor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </>
                  ) : (
                    <td className="py-4 px-4 text-right font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                      {(p.paginasEstimadasTotal ?? (p.paginasEstimadasPB + p.paginasEstimadasColor)).toLocaleString('pt-BR')}
                    </td>
                  )}

                  {/* Franquia Fixa */}
                  <td className="py-4 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    R$ {p.custoFranquiaFixa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Custo Total Estimado */}
                  <td className="py-4 px-4 text-right font-mono font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-slate-800/40 text-sm">
                    R$ {p.custoTotalEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>

                  {/* Resmas Papel */}
                  <td className="py-4 px-4 text-right font-mono text-amber-600 dark:text-amber-300">
                    {p.resmasEstimadas.toLocaleString('pt-BR')} resmas
                  </td>

                  {/* Caixas Papel */}
                  <td className="py-4 px-4 text-right font-mono text-amber-700 dark:text-amber-400 font-bold">
                    {p.caixasEstimadas.toLocaleString('pt-BR')} caixas
                  </td>

                  {/* Custo Insumos Papel */}
                  <td className="py-4 px-4 text-right font-mono text-amber-600 dark:text-amber-300">
                    R$ {p.custoPapelEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
