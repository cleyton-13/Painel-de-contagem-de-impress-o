'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { LoginModal } from '@/components/LoginModal';
import { ReportModal } from '@/components/ReportModal';
import { AlertCircle, RefreshCw } from 'lucide-react';

import {
  Unidade, Impressora, PerfilFranquia, ConfiguracaoSistema,
  DashboardKPIs, TimelineDataPoint, BranchRankingItem, FinancialProjection,
  ContagemDiariaItem, MonitorEnviosPayload,
} from '@/lib/types';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function HomeContent() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('contagem');
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  const [selectedUnidade, setSelectedUnidade] = useState<string>('ALL');
  const [periodo, setPeriodo] = useState<string>('30dias');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [iaOpen, setIaOpen] = useState<boolean>(false);
  const [reportsOpen, setReportsOpen] = useState<boolean>(false);

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

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveShowCosts = viewMode === 'operacional' ? false : showCosts;
  const effectiveShowProjections = viewMode === 'operacional' ? false : showProjections;
  const effectiveShowFranchise = viewMode === 'operacional' ? false : showFranchise;
  const effectiveHideCurrency = viewMode === 'operacional' ? true : hideCurrency;

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  const jsonFetch = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, { cache: 'no-store', ...init });
    if (res.status === 401) {
      setIsAuth(false);
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  }, []);

  // 1. Checa autenticação inicial
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (active) setIsAuth(Boolean(d.authenticated));
      })
      .catch(() => {
        if (active) setIsAuth(false);
      });
    return () => {
      active = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const loadStaticData = useCallback(async () => {
    try {
      const [unidadesData, contratosData, configData] = await Promise.all([
        jsonFetch<Unidade[]>('/api/unidades'),
        jsonFetch<PerfilFranquia[]>('/api/contratos'),
        jsonFetch<ConfiguracaoSistema>('/api/configuracao'),
      ]);
      setUnidades(unidadesData);
      setContratos(contratosData);
      setConfiguracaoSistema(configData);

      // Se a unidade selecionada não existir mais na lista, reseta para ALL
      setSelectedUnidade((curr) => {
        if (curr !== 'ALL' && !unidadesData.some((u) => u.id === curr)) {
          return 'ALL';
        }
        return curr;
      });
    } catch (e) {
      console.error('Falha ao carregar dados estáticos:', errMsg(e));
      throw e;
    }
  }, [jsonFetch]);

  const loadDynamicData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedUnidade !== 'ALL') params.set('unidadeId', selectedUnidade);
      if (periodo) params.set('periodo', periodo);
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const [impressorasData, dashData, finData, contagemData, monitorData] = await Promise.all([
        jsonFetch<Impressora[]>(`/api/impressoras${queryStr}`),
        jsonFetch<{ kpis: DashboardKPIs; timeline: TimelineDataPoint[]; branchRanking: BranchRankingItem[] }>(`/api/dashboard${queryStr}`),
        jsonFetch<FinancialProjection[]>(`/api/financeiro${queryStr}`),
        jsonFetch<ContagemDiariaItem[]>(`/api/contagem-diaria${queryStr}`),
        jsonFetch<MonitorEnviosPayload>('/api/monitor'),
      ]);

      setImpressoras(impressorasData);
      setKpis(dashData.kpis);
      setTimeline(dashData.timeline);
      setBranchRanking(dashData.branchRanking);
      setProjections(finData);
      setContagemDiaria(contagemData);
      setMonitorEnvios(monitorData);
      setDadosCarregados(true);
      setLoadError(null);
    } catch (e) {
      console.error('Falha ao carregar dados dinâmicos:', errMsg(e));
      throw e;
    }
  }, [selectedUnidade, periodo, jsonFetch]);

  const loadData = useCallback(async () => {
    if (isAuth !== true) return;
    try {
      await Promise.all([loadStaticData(), loadDynamicData()]);
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, [isAuth, loadStaticData, loadDynamicData]);

  // Dispara carga inicial de forma assíncrona desacoplada do ciclo síncrono de render
  useEffect(() => {
    let unmounted = false;
    if (isAuth === true) {
      const timer = setTimeout(() => {
        loadData().catch((err) => {
          if (!unmounted) console.warn('Erro na carga inicial:', err);
        });
      }, 0);
      return () => {
        unmounted = true;
        clearTimeout(timer);
      };
    }
  }, [isAuth, loadData]);

  // Auto-refresh inteligente a cada 15 segundos (somente quando autenticado e aba visível)
  useEffect(() => {
    if (isAuth !== true || !dadosCarregados) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadDynamicData().catch((err) => console.warn('Erro no refresh em background:', err));
      }
    }, 15000);

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadDynamicData().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuth, dadosCarregados, loadDynamicData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
      showToast('Dados atualizados com sucesso.');
    } catch (e) {
      showToast(`Erro na atualização: ${errMsg(e)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setIsAuth(false);
      setDadosCarregados(false);
    }
  };

  const handleUpdateApelido = async (serial: string, novoApelido: string) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/impressoras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, apelido: novoApelido }),
      });
      if (res.success) {
        await loadData();
        showToast(`Setor/apelido atualizado: "${novoApelido}".`);
      }
    } catch (e) {
      showToast(`Erro: ${errMsg(e)}`);
    }
  };

  const handleUpdateConfigImpressora = async (
    serial: string,
    config: { preExistente?: boolean; leituraReferenciaPB?: number | null; leituraReferenciaColor?: number | null }
  ) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/impressoras', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, ...config }),
      });
      if (res.success) {
        await loadData();
        showToast(`Configuração da impressora ${serial} atualizada.`);
      }
    } catch (e) {
      showToast(`Erro: ${errMsg(e)}`);
    }
  };

  const handleSaveContrato = async (contrato: Partial<PerfilFranquia>) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/contratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contrato),
      });
      if (res.success) {
        await loadData();
        showToast(`Perfil de franquia "${contrato.nome}" salvo.`);
      }
    } catch (e) {
      showToast(`Erro: ${errMsg(e)}`);
    }
  };

  const handleAssignContrato = async (unidadeId: string, contratoId: string | null) => {
    try {
      const res = await jsonFetch<{ success: boolean }>('/api/unidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assignContrato', unidadeId, contratoId }),
      });
      if (res.success) {
        await loadData();
        showToast('Perfil de franquia vinculado à unidade.');
      }
    } catch (e) {
      showToast(`Erro: ${errMsg(e)}`);
    }
  };

  const handleMergeUnidades = async (origemId: string, destinoId: string) => {
    try {
      const res = await jsonFetch<{ success: boolean; message: string }>('/api/unidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', unidadeOrigemId: origemId, unidadeDestinoId: destinoId }),
      });
      if (res.success) {
        await loadData();
        showToast(res.message);
      }
      return { success: res.success, message: res.message };
    } catch (e) {
      return { success: false, message: `Erro: ${errMsg(e)}` };
    }
  };

  const handleDeleteUnidade = async (unidadeId: string, confirmNome: string) => {
    try {
      const res = await jsonFetch<{ success: boolean; message: string }>('/api/unidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', unidadeId, confirmNome }),
      });
      if (res.success) {
        await loadData();
        showToast(res.message);
      }
      return { success: res.success, message: res.message };
    } catch (e) {
      return { success: false, message: `Erro: ${errMsg(e)}` };
    }
  };

  const hasSLAAlert = Boolean(kpis && kpis.unidadesPendentesSLA.length > 0);

  // Verificação inicial de autenticação
  if (isAuth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-semibold">Verificando sessão...</span>
        </div>
      </div>
    );
  }

  if (isAuth === false) {
    return <LoginModal onSuccess={() => setIsAuth(true)} />;
  }

  return (
    <div
      className={`min-h-screen font-sans antialiased flex ${
        theme === 'dark'
          ? 'bg-slate-950 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(34,211,238,0.07),transparent)] text-slate-100'
          : 'bg-gray-50 text-gray-900'
      }`}
    >
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center space-x-2 transition-all duration-200 ${
            theme === 'dark'
              ? 'bg-slate-900 border border-cyan-500/40 text-cyan-200'
              : 'bg-white border border-cyan-300 text-cyan-800 shadow-lg'
          }`}
        >
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
        onOpenIA={() => setIaOpen(true)}
        onOpenReports={() => setReportsOpen(true)}
        onLogout={handleLogout}
      />

      {/* Modais */}
      <AIAnalysisModal open={iaOpen} onClose={() => setIaOpen(false)} />
      <ReportModal isOpen={reportsOpen} onClose={() => setReportsOpen(false)} unidades={unidades} />

      {/* Main Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 min-w-0 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
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
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {loadError ? (
            <div className="glass-panel rounded-2xl p-8 max-w-xl mx-auto my-16 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Não foi possível carregar os dados</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{loadError}</p>
              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar novamente</span>
              </button>
            </div>
          ) : !dadosCarregados || !kpis ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-500 space-y-3">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-xs font-semibold">Carregando dados corporativos...</span>
            </div>
          ) : (
            <>
              {activeTab === 'contagem' && (
                <TabContagemDiaria
                  data={contagemDiaria}
                  periodo={periodo}
                  unidadeId={selectedUnidade}
                  usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false}
                  monitorEnvios={monitorEnvios}
                />
              )}
              {activeTab === 'dashboard' && (
                <TabDashboard
                  kpis={kpis}
                  timeline={timeline}
                  branchRanking={branchRanking}
                  showCosts={effectiveShowCosts}
                  hideCurrency={effectiveHideCurrency}
                  usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false}
                />
              )}
              {activeTab === 'impressoras' && (
                <TabImpressoras
                  impressoras={impressoras}
                  onUpdateApelido={handleUpdateApelido}
                  onUpdateConfig={handleUpdateConfigImpressora}
                  showCosts={effectiveShowCosts}
                  hideCurrency={effectiveHideCurrency}
                  usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false}
                />
              )}
              {activeTab === 'financeiro' && (
                <TabFinanceiro
                  projections={projections}
                  kpis={kpis}
                  showProjections={effectiveShowProjections}
                  showFranchise={effectiveShowFranchise}
                  hideCurrency={effectiveHideCurrency}
                  usarSeparacaoCores={configuracaoSistema?.usarSeparacaoCores ?? false}
                />
              )}
              {activeTab === 'armazenamento' && (
                <TabMonitorEnvios initialData={monitorEnvios} onRefresh={loadData} />
              )}
              {activeTab === 'contratos' && (
                <TabContratos
                  contratos={contratos}
                  unidades={unidades}
                  onSaveContrato={handleSaveContrato}
                  onAssignContrato={handleAssignContrato}
                  onMergeUnidades={handleMergeUnidades}
                  onDeleteUnidade={handleDeleteUnidade}
                />
              )}
              {activeTab === 'configuracoes' && <TabConfiguracoes />}
            </>
          )}
        </main>

        {/* Footer */}
        <footer
          className={`border-t py-4 text-center text-xs ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-gray-200 text-gray-500'
          }`}
        >
          Painel BI Enterprise · Telemetria Konica Minolta & Multimarcas
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
