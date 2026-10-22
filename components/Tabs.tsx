'use client';

import React from 'react';
import { LayoutDashboard, Printer, DollarSign, Send, FileText, BarChart3, Settings } from 'lucide-react';

export type TabType = 'contagem' | 'impressoras' | 'financeiro' | 'armazenamento' | 'contratos' | 'dashboard' | 'configuracoes';

interface TabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  printerCount: number;
  slaPendingCount: number;
}

export const Tabs: React.FC<TabsProps> = ({
  activeTab,
  onTabChange,
  printerCount,
  slaPendingCount
}) => {
  const tabsList = [
    {
      id: 'contagem' as TabType,
      label: '1. Contagem Diária',
      icon: BarChart3,
    },
    {
      id: 'impressoras' as TabType,
      label: '2. Parque de Impressoras',
      icon: Printer,
      badge: `${printerCount} Equip.`,
      badgeColor: 'bg-blue-950 text-blue-300 border-blue-800/60'
    },
    {
      id: 'financeiro' as TabType,
      label: '3. Projeções Financeiras & Insumos',
      icon: DollarSign
    },
    {
      id: 'armazenamento' as TabType,
      label: '4. Monitor de Envios',
      icon: Send
    },
    {
      id: 'contratos' as TabType,
      label: '5. Gestão de Contratos, Aliases & Fusão',
      icon: FileText
    },
    {
      id: 'dashboard' as TabType,
      label: '6. Visão Geral Executiva',
      icon: LayoutDashboard,
      badge: slaPendingCount > 0 ? `${slaPendingCount} Pendência` : null,
      badgeColor: 'bg-red-900/80 text-red-300 border-red-700/60'
    },
    {
      id: 'configuracoes' as TabType,
      label: '7. Configurações',
      icon: Settings
    }
  ];

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-700 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-2 overflow-x-auto py-2 scrollbar-none" aria-label="Tabs">
          {tabsList.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-600/30 dark:shadow-blue-500/30'
                    : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-2 py-0.5 text-xs font-bold border rounded-full ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
