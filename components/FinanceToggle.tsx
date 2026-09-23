'use client';

import React from 'react';
import { Eye, EyeOff, Briefcase, Wrench } from 'lucide-react';

interface FinanceToggleProps {
  viewMode: 'comercial' | 'operacional';
  onViewModeChange: (mode: 'comercial' | 'operacional') => void;
  showCosts: boolean;
  onToggleCosts: () => void;
  showProjections: boolean;
  onToggleProjections: () => void;
  showFranchise: boolean;
  onToggleFranchise: () => void;
  hideCurrency: boolean;
  onToggleHideCurrency: () => void;
}

export const FinanceToggle: React.FC<FinanceToggleProps> = ({
  viewMode,
  onViewModeChange,
  showCosts,
  onToggleCosts,
  showProjections,
  onToggleProjections,
  showFranchise,
  onToggleFranchise,
  hideCurrency,
  onToggleHideCurrency,
}) => {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Modo Comercial / Operacional */}
      <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden shrink-0">
        <button
          onClick={() => onViewModeChange('comercial')}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            viewMode === 'comercial'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-transparent dark:hover:text-slate-200'
          }`}
        >
          <Briefcase className="w-3 h-3" />
          Comercial
        </button>
        <button
          onClick={() => onViewModeChange('operacional')}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            viewMode === 'operacional'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-transparent dark:hover:text-slate-200'
          }`}
        >
          <Wrench className="w-3 h-3" />
          Operacional
        </button>
      </div>

      {/* Checkboxes de seção (só no modo comercial) */}
      {viewMode === 'comercial' && (
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-1 shrink-0">
          <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCosts}
              onChange={onToggleCosts}
              className="w-3 h-3 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
            />
            Custos
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showProjections}
              onChange={onToggleProjections}
              className="w-3 h-3 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
            />
            Projeções
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFranchise}
              onChange={onToggleFranchise}
              className="w-3 h-3 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
            />
            Franquia
          </label>
        </div>
      )}

      {/* Ocultar valores R$ */}
      <button
        onClick={onToggleHideCurrency}
        className={`flex items-center gap-1 px-2 py-1.5 text-xs font-semibold border rounded-lg transition-all cursor-pointer shrink-0 ${
          hideCurrency
            ? 'bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300'
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-transparent dark:hover:text-slate-200'
        }`}
        title={hideCurrency ? 'Mostrar valores em R$' : 'Ocultar valores em R$'}
      >
        {hideCurrency ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {hideCurrency ? 'Oculto' : 'R$'}
      </button>
    </div>
  );
};
