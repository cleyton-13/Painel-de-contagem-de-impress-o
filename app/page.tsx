'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from '@/components/ThemeContext';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { TabType } from '@/components/Tabs';
import { TabContagemDiaria } from '@/components/TabContagemDiaria';
import { AIAnalysisModal } from '@/components/AIAnalysisModal';
import { TabDashboard } from '@/components/TabDashboard';
import { TabImpressoras } from '@/components/TabImpressoras';
import { TabFinanceiro } from '@/components/TabFinanceiro';
import { TabMonitorEnvios } from '@/components/TabMonitorEnvios';
import { TabContratos } from '@/components/TabContratos';
import { TabConfiguracoes } from '@/components/TabConfiguracoes';

import {
  Unidade, Impressora, PerfilFranquia, ConfiguracaoSistema,
  DashboardKPIs, TimelineDataPoint, BranchRankingItem, FinancialProjection,
  ContagemDiariaItem, MonitorEnviosPayload,
} from '@/lib/types';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function HomeContent() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('contagem');
  const [selectedUnidade, setSelectedUnidade] = useState<string>('ALL');
  const [periodo, setPeriodo] = useState<string>('30dias');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [iaOpen, setIaOpen] = useState<boolean>(false);

  const [viewMode, setViewMode] = useState<'comercial' | 'operacional'>('comercial');
  const [showCosts, setShowCosts] = useState<boolean>(true);
  const [showProjections, setShowProjections] = useState<boolean>(true);
  const [showFranchise, setShowFranchise] = useState<boolean>(true);
  const [hideCurrency, setHideCurrency] = useState<boolean>(false);

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [impressoras, setImpressoras] = useState<Impressora[]>([]);
  const [contratos, setContratos] = useState<PerfilFranquia[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [timeline, setTimeline] = useState<TimelineDataPoint[]>([]);
  const [branchRanking, setBranchRanking] = useState<BranchRankingItem[]>([]);
  const [projections, setProjections] = useState<FinancialProjection[]>([]);
  const [configuracaoSistema, setConfiguracaoSistema] = useState<ConfiguracaoSistema | null>(null);
  const [contagemDiaria, setContagemDiaria] = useState<ContagemDiariaItem[]>([]);
  const [monitorEnvios, setMonitorEnvios] = useState<MonitorEnviosPayload | null>(null);
  const [dadosCarregados, setDadosCarregados] = useState<boolean>(false);

  const effectiveShowCosts = viewMode === 'operacional' ? false : showCosts;
  const effectiveShowProjections = viewMode === 'operacional' ? false : showProjections;
  const effectiveShowFranchise = viewMode === 'operacional' ? false : showFranchise;
  const effectiveHideCurrency = viewMode === 'operacional' ? true : hideCurrency;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedUnidade !== 'ALL') params.set('unidadeId', selectedUnidade);
      if (periodo) params.set('periodo', periodo);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      
      const [unidadesData, impressorasData, contratosData, dashData, finData, configData, contagemData, monitorData] = await Promise.all([
        jsonFetch<Unidade[]>('/api/unidades'),
        jsonFetch<Impressora[]>(`/api/impressoras${queryStr}`),
        jsonFetch<PerfilFranquia[]>('/api/contratos'),
        jsonFetch<{ kpis: DashboardKPIs; timeline: TimelineDataPoint[]; branchRanking: BranchRankingItem[] }>(`/api/dashboard${queryStr}`),
        jsonFetch<FinancialProjection[]>(`/api/financeiro${queryStr}`),
        jsonFetch<ConfiguracaoSistema>('/api/configuracao'),
        jsonFetch<ContagemDiariaItem[]>(`/api/contagem-diaria${queryStr}`),
        jsonFetch<MonitorEnviosPayload>('/api/monitor'),
      ]);
      setUnidades(unidadesData);
      setImpressoras(impressorasData);
      setContratos(contratosData);
      setKpis(dashData.kpis);
      setTimeline(dashData.timeline);
      setBranchRanking(dashData.branchRanking);
      setProjections(finData);
      setConfiguracaoSistema(configData);
      setContagemDiaria(contagemData);
      setMonitorEnvios(monitorData);
      setDadosCarregados(true);
    } catch (e) {
      console.error('Falha ao carregar dados:', errMsg(e));
    }
  }, [selectedUnidade, periodo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh em tempo quase real (15s) enquanto dados carregados
  useEffect(() => {
    if (!dadosCarregados) return;
    const interval = setInterval(() => {
      loadData();
    }, 15000);
    return () => clearInterval(interval);
  }, [dadosCarregados, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
      showToast('Dados atualizados.');
    } catch (e) {
      showToast(`Erro: ${errMsg(e)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUpdateApelido = async (serial: string, novoApelido: string) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/impressoras', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, apelido: novoApelido }),
      });
      if (res.success) { await loadData(); showToast(`Apelido atualizado: "${novoApelido}".`); }
    } catch (e) { showToast(`Erro: ${errMsg(e)}`); }
  };

  const handleUpdateConfigImpressora = async (serial: string, config: { preExistente?: boolean; leituraReferenciaPB?: number | null; leituraReferenciaColor?: number | null }) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/impressoras', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, ...config }),
      });
      if (res.success) {
        await loadData();
        showToast('Configuracao atualizada para ' + serial + '.');
      }
    } catch (e) {
      showToast('Erro: ' + errMsg(e));
    }
   };

  const handleSaveContrato = async (contrato: Partial<PerfilFranquia>) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/contratos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contrato),
      });
      if (res.success) { await loadData(); showToast(`Perfil "${contrato.nome}" salvo.`); }
    } catch (e) { showToast(`Erro: ${errMsg(e)}`); }
  };

  const handleAssignContrato = async (unidadeId: string, contratoId: string | null) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/unidades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignContrato', unidadeId, contratoId }),
      });
      if (res.success) { await loadData(); showToast('Contrato vinculado.'); }
    } catch (e) { showToast(`Erro: ${errMsg(e)}`); }
  };

  const handleMergeUnidades = async (origemId: string, destinoId: string) => {
    try {
      const res = await jsonFetch<{ success: boolean; message: string }>('/api/unidades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', unidadeOrigemId: origemId, unidadeDestinoId: destinoId }),
      });
      if (res.success) { await loadData(); showToast(res.message); }
      return { success: res.success, message: res.message };
    } catch (e) { return { success: false, message: `Erro: ${errMsg(e)}` }; }
  };

  const handleDeleteUnidade = async (unidadeId: string, confirmNome: string) => {
    try {
      const res = await jsonFetch<{ success: boolean; message: string }>('/api/unidades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', unidadeId, confirmNome }),
      });
      if (res.success) { await loadData(); showToast(res.message); }
      return { success: res.success, message: res.message };
    } catch (e) { return { success: false, message: `Erro: ${errMsg(e)}` }; }
  };

  const handleUpdateConfigContagem = async (config: { usarSeparacaoCores?: boolean; faturamentoHabilitado?: boolean; tarifaUnica?: number }) => {
    try {
      const res = await jsonFetch<{ success: boolean; usarSeparacaoCores: boolean; faturamentoHabilitado: boolean; tarifaUnica: number }>('/api/configuracao', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
      });
      if (res.success) {
        await loadData();
        showToast('Configuracao de contagem atualizada.');
      }
      return {
        success: res.success,
        message: res.success ? `OK: separacao de cores ${res.usarSeparacaoCores ? 'ativada' : 'desativada'} (tarifa unica R$ ${res.tarifaUnica.toFixed(2)}).` : 'Erro ao salvar configuracao de contagem.',
      };
    } catch (e) { return { success: false, message: `Erro: ${errMsg(e)}` }; }
  };

  const hasSLAAlert = kpis ? kpis.unidadesPendentesSLA.length > 0 : false;

  return (
    <div className={`min-h-screen font-sans antialiased flex ${theme === 'dark' ? 'bg-slate-950 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(34,211,238,0.07),transparent)] text-slate-100' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center space-x-2 animate-bounce ${theme === 'dark' ? 'bg-cyan-950 border border-cyan-700 text-cyan-200' : 'bg-white border border-cyan-300 text-cyan-800 shadow-lg'}`}>
          <span className={`w-2 h-2 rounded-full ${theme === 'dark' ? 'bg-cyan-400' : 'bg-cyan-500'}`} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        printerCount={impressoras.length}
        slaPendingCount={kpis ? kpis.unidadesPendentesSLA.length : 0}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        kpis={kpis}
        contagemDiaria={contagemDiaria}
        impressoras={impressoras}
        timeline={timeline}
        branchRanking={branchRanking}
        hideCurrency={effectiveHideCurrency}
        usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false}
        onOpenIA={() => setIaOpen(true)}
      />

      {/* Modal de Análise de IA */}
      <AIAnalysisModal open={iaOpen} onClose={() => setIaOpen(false)} />

      {/* Main Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
        
        {/* Header */}
        <Header
          unidades={unidades}
          selectedUnidade={selectedUnidade}
          onSelectUnidade={setSelectedUnidade}
          periodo={periodo}
          onSelectPeriodo={setPeriodo}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          hasSLAAlert={hasSLAAlert}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showCosts={showCosts}
          onToggleCosts={() => setShowCosts(!showCosts)}
          showProjections={showProjections}
          onToggleProjections={() => setShowProjections(!showProjections)}
          showFranchise={showFranchise}
          onToggleFranchise={() => setShowFranchise(!showFranchise)}
          hideCurrency={hideCurrency}
          onToggleHideCurrency={() => setHideCurrency(!hideCurrency)}
        />

        {/* Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          {!dadosCarregados || !kpis ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-500 space-y-3">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs font-semibold">Carregando dados do PostgreSQL...</span>
            </div>
          ) : (
            <>
              {activeTab === 'contagem' && <TabContagemDiaria data={contagemDiaria} periodo={periodo} unidadeId={selectedUnidade} usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false} monitorEnvios={monitorEnvios} />}
              {activeTab === 'dashboard' && (
                <TabDashboard kpis={kpis} timeline={timeline} branchRanking={branchRanking} showCosts={effectiveShowCosts} hideCurrency={effectiveHideCurrency} usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false} />
              )}
               {activeTab === 'impressoras' && (
                 <TabImpressoras impressoras={impressoras} onUpdateApelido={handleUpdateApelido} onUpdateConfig={handleUpdateConfigImpressora} showCosts={effectiveShowCosts} hideCurrency={effectiveHideCurrency} usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false} />
               )}
              {activeTab === 'financeiro' && (
                <TabFinanceiro projections={projections} kpis={kpis} showProjections={effectiveShowProjections} showFranchise={effectiveShowFranchise} hideCurrency={effectiveHideCurrency} usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false} />
              )}
              {activeTab === 'armazenamento' && (
                <TabMonitorEnvios initialData={monitorEnvios} onRefresh={loadData} />
              )}
              {activeTab === 'contratos' && (
                <TabContratos contratos={contratos} unidades={unidades} onSaveContrato={handleSaveContrato} onAssignContrato={handleAssignContrato} onMergeUnidades={handleMergeUnidades} onDeleteUnidade={handleDeleteUnidade} />
              )}
              {activeTab === 'configuracoes' && (
                <TabConfiguracoes />
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className={`border-t py-4 text-center text-xs ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-gray-200 text-gray-500'}`}>
          Painel Konica Minolta BI Enterprise
        </footer>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <HomeContent />
    </ThemeProvider>
  );
}