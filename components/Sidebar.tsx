'use client';

import React from 'react';
import {
  BarChart3, Printer, DollarSign, Send, FileText, LayoutDashboard,
  ChevronLeft, ChevronRight, Printer as PrinterIcon, Download, Sparkles, Settings, LogOut
} from 'lucide-react';
import { TabType } from './Tabs';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  printerCount: number;
  slaPendingCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenIA?: () => void;
  onOpenReports?: () => void;
  onLogout?: () => void;
}

const tabsList: Array<{ id: TabType; label: string; shortLabel: string; icon: React.ElementType; badgeColor?: string }> = [
  { id: 'contagem', label: 'Contagem Diária', shortLabel: 'Contagem', icon: BarChart3 },
  { id: 'impressoras', label: 'Parque de Impressoras', shortLabel: 'Impressoras', icon: Printer, badgeColor: 'bg-blue-950 text-blue-300 border-blue-800/60' },
  { id: 'financeiro', label: 'Projeções Financeiras', shortLabel: 'Financeiro', icon: DollarSign },
  { id: 'armazenamento', label: 'Monitor de Envios', shortLabel: 'Envios', icon: Send },
  { id: 'contratos', label: 'Contratos & Aliases', shortLabel: 'Contratos', icon: FileText },
  { id: 'dashboard', label: 'Visão Geral Executiva', shortLabel: 'Dashboard', icon: LayoutDashboard, badgeColor: 'bg-red-900/80 text-red-300 border-red-700/60' },
  { id: 'configuracoes', label: 'Configurações', shortLabel: 'Configurações', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  printerCount,
  slaPendingCount,
  collapsed,
  onToggleCollapse,
  onOpenIA,
  onOpenReports,
  onLogout,
}) => {
  const getBadge = (tab: typeof tabsList[0]) => {
    if (tab.id === 'impressoras') return `${printerCount}`;
    if (tab.id === 'dashboard' && slaPendingCount > 0) return `${slaPendingCount}`;
    return null;
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-30 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'px-3'} h-16 border-b border-slate-200 dark:border-slate-800`}>
        <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl text-white shrink-0 shadow-md shadow-blue-500/20">
          <PrinterIcon className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="ml-2 overflow-hidden">
            <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
              Painel <span className="text-cyan-600 dark:text-cyan-400">BI</span>
            </span>
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
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 border-l-[3px] border-transparent'
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
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Ações Especiais */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-1">
        {/* Análise IA */}
        <button
          onClick={() => onOpenIA && onOpenIA()}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'px-3'} py-2 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-all cursor-pointer`}
          title={collapsed ? 'Análise da IA' : undefined}
        >
          <Sparkles className="w-4 h-4 shrink-0 text-purple-500" />
          {!collapsed && (
            <span className="ml-3 text-xs font-semibold">Análise da IA</span>
          )}
        </button>

        {/* Extrair Relatório */}
        <button
          onClick={() => onOpenReports && onOpenReports()}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'px-3'} py-2 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all cursor-pointer`}
          title={collapsed ? 'Extrair Relatório' : undefined}
        >
          <Download className="w-4 h-4 shrink-0 text-emerald-500" />
          {!collapsed && (
            <span className="ml-3 text-xs font-semibold">Extrair Relatório</span>
          )}
        </button>

        {/* Sair / Logout */}
        {onLogout && (
          <button
            onClick={onLogout}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'px-3'} py-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all cursor-pointer`}
            title={collapsed ? 'Sair' : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="ml-3 text-xs font-semibold">Sair</span>
            )}
          </button>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={onToggleCollapse}
        className="h-10 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
        title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
};
