'use client';

import React from 'react';
import { Calendar, RefreshCw, AlertTriangle, Building2, Sun, Moon } from 'lucide-react';
import { Unidade } from '@/lib/types';
import { FinanceToggle } from './FinanceToggle';
import { useTheme, PALETTES, Palette } from './ThemeContext';

interface HeaderProps {
  unidades: Unidade[];
  selectedUnidade: string;
  onSelectUnidade: (id: string) => void;
  periodo: string;
  onSelectPeriodo: (p: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  hasSLAAlert: boolean;
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

export const Header: React.FC<HeaderProps> = ({
  unidades,
  selectedUnidade,
  onSelectUnidade,
  periodo,
  onSelectPeriodo,
  onRefresh,
  isRefreshing,
  hasSLAAlert,
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
  const { theme, toggleTheme, palette, setPalette } = useTheme();

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 shadow-sm dark:shadow-xl">
      <div className="px-4 sm:px-6 lg:px-4">
        <div className="flex items-center justify-between py-3 gap-3">
          
          {/* SLA Alert */}
          {hasSLAAlert && (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-red-100 dark:bg-red-950/80 border border-red-300 dark:border-red-800/80 text-red-700 dark:text-red-300 rounded-lg text-xs font-medium animate-pulse shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
              <span className="hidden sm:inline">SLA Pendente!</span>
            </div>
          )}

          {/* Global Filters */}
          <div className="flex flex-wrap items-center gap-1.5 flex-1 justify-end">
            
            {/* Finance Toggle */}
            <FinanceToggle
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              showCosts={showCosts}
              onToggleCosts={onToggleCosts}
              showProjections={showProjections}
              onToggleProjections={onToggleProjections}
              showFranchise={showFranchise}
              onToggleFranchise={onToggleFranchise}
              hideCurrency={hideCurrency}
              onToggleHideCurrency={onToggleHideCurrency}
            />

            {/* Branch Filter */}
            <div className="relative flex items-center shrink-0">
              <Building2 className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
              <select
                value={selectedUnidade}
                onChange={(e) => onSelectUnidade(e.target.value)}
                title="Filial"
                className="pl-8 pr-7 py-1.5 w-auto max-w-[170px] truncate rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 transition-colors cursor-pointer"
              >
                <option value="ALL">Todas ({unidades.length})</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>

            {/* Period Filter */}
            <div className="relative flex items-center shrink-0">
              <Calendar className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
              <select
                value={periodo}
                onChange={(e) => onSelectPeriodo(e.target.value)}
                title="Período"
                className="pl-8 pr-7 py-1.5 w-auto max-w-[125px] truncate rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 transition-colors cursor-pointer"
              >
                <option value="hoje">Hoje</option>
                <option value="7dias">7 dias</option>
                <option value="30dias">30 dias</option>
                <option value="trimestre">Trimestre</option>
                <option value="ano">Ano</option>
              </select>
            </div>

            {/* Sync Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Atualizar dados"
              className="flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            {/* Palette Selector */}
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value as Palette)}
              className="pl-2 pr-7 py-1.5 w-auto max-w-[105px] truncate rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white transition-colors cursor-pointer shrink-0"
              title="Paleta de cores"
            >
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer shrink-0"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
