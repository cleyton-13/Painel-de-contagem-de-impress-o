'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Send, CheckCircle2, AlertTriangle, RefreshCcw, Copy, Clock, FileSpreadsheet,
  Hourglass, Info, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { MonitorEnviosPayload } from '@/lib/types';

interface TabMonitorEnviosProps {
  initialData: MonitorEnviosPayload | null;
  onRefresh: () => void;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  PROCESSADO: { label: 'Novo', className: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60' },
  ATUALIZADO: { label: 'Atualizado', className: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700/60' },
  DUPLICADO: { label: 'Duplicado', className: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/60' },
  ERRO: { label: 'Erro', className: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700/60' },
};

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const TabMonitorEnvios: React.FC<TabMonitorEnviosProps> = ({ initialData, onRefresh }) => {
  const [data, setData] = useState<MonitorEnviosPayload | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string | null>(initialData?.atualizadoEm || null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/monitor', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload: MonitorEnviosPayload = await res.json();
      setData(payload);
      setLastUpdate(payload.atualizadoEm);
    } catch (e) {
      console.error('Falha ao carregar monitor de envios:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // auto-refresh 15s
    return () => clearInterval(interval);
  }, [load]);

  const unidadesPendentes = data?.unidades.filter((u) => u.pendenteHoje) || [];
  const registros = data?.registros || [];
  const totalUnidades = data?.unidades.length || 0;
  const enviosHoje = registros.filter((r) => {
    const d = new Date(r.dataProcessamento);
    const hoje = new Date();
    return d.toDateString() === hoje.toDateString();
  });
  const atualizadosHoje = enviosHoje.filter((r) => r.status === 'ATUALIZADO');
  const duplicadosHoje = enviosHoje.filter((r) => r.status === 'DUPLICADO');

  const PAGE_SIZE = 12;
  const totalPages = Math.max(1, Math.ceil(registros.length / PAGE_SIZE));
  const pageRegistros = registros.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatMB = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-2 text-emerald-500">
            <Send className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Envios hoje</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{enviosHoje.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-300">{totalUnidades} unidade(s) cadastrada(s)</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-2 text-red-500">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Pendentes hoje</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{unidadesPendentes.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-300">sem leitura de hoje</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-2 text-blue-500">
            <RefreshCcw className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Atualizados hoje</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{atualizadosHoje.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-300">reenvios com dados novos</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-2 text-amber-500">
            <Copy className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Duplicados hoje</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{duplicadosHoje.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-300">reenvios sem alteracao</div>
        </div>
      </div>

      {/* Status das unidades */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Status por Unidade</span>
          </div>
          <div className="flex items-center space-x-2">
            {isLoading && <span className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />}
            <span className="text-xs text-slate-500 dark:text-slate-300">
              {lastUpdate ? `Atualizado ${fmtData(lastUpdate)}` : ''}
            </span>
            <button
              onClick={() => { load(); onRefresh(); }}
              className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg transition-all cursor-pointer"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
                <th className="px-4 py-2.5 font-bold">Unidade</th>
                <th className="px-4 py-2.5 font-bold">Ultimo Envio</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold text-center">Envios Hoje</th>
                <th className="px-4 py-2.5 font-bold text-center">Leituras Hoje</th>
                <th className="px-4 py-2.5 font-bold text-center">Impressoes Hoje</th>
                <th className="px-4 py-2.5 font-bold">Situacao</th>
              </tr>
            </thead>
            <tbody>
              {data?.unidades.map((u) => {
                const badge = statusBadge[u.statusUltimoEnvio || ''] || statusBadge.ERRO;
                return (
                  <tr key={u.unidadeId} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white">{u.unidadeNome}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-300">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{u.dataUltimoEnvio ? fmtData(u.dataUltimoEnvio) : 'Nunca'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.statusUltimoEnvio ? (
                        <span className={`px-2 py-0.5 text-xs font-bold border rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-slate-900 dark:text-white">{u.enviosHoje}</td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-slate-900 dark:text-white">{u.leiturasHoje}</td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-slate-900 dark:text-white">{u.impressoesDia.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3">
                      {u.pendenteHoje ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-bold border rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700/60">
                          <Hourglass className="w-3 h-3" />
                          <span>Pendente</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-xs font-bold border rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Em dia</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historico de envios */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Historico de Envios (ultimos 30)</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-300">reenvios atualizam leituras com contadores maiores</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
                <th className="px-4 py-2.5 font-bold">Arquivo</th>
                <th className="px-4 py-2.5 font-bold">Unidade</th>
                <th className="px-4 py-2.5 font-bold">Enviado em</th>
                <th className="px-4 py-2.5 font-bold">Tamanho</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 font-bold text-center">Novas</th>
                <th className="px-4 py-2.5 font-bold text-center">Atualizadas</th>
              </tr>
            </thead>
            <tbody>
              {pageRegistros.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                    <Info className="w-4 h-4 inline mr-1" />
                    Nenhum envio registrado ainda. As unidades devem enviar seus CSVs para o endpoint de ingestao.
                  </td>
                </tr>
              )}
              {pageRegistros.map((r) => {
                const badge = statusBadge[r.status] || statusBadge.ERRO;
                return (
                  <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-slate-900 dark:text-white max-w-[280px] truncate" title={r.nomeArquivo}>
                      {r.nomeArquivo}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white">{r.unidadeNome || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-300">{fmtData(r.dataProcessamento)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-300">{formatMB(r.tamanhoBytes)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-bold border rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300">{r.novas}</td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-slate-700 dark:text-slate-300">{r.atualizadas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-300">Pagina {page + 1} de {totalPages}</span>
            <div className="flex space-x-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg disabled:opacity-40 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg disabled:opacity-40 transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};