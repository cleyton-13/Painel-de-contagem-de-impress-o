'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Save, Trash2, Mail, Loader2, CheckCircle2, AlertCircle, Bot } from 'lucide-react';
import { ModeloIA, ProvedorIA } from '@/lib/types';

export const TabConfiguracoes: React.FC = () => {
  const [mesesRetencao, setMesesRetencao] = useState('6');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ success: boolean; msg: string } | null>(null);

  // IA Settings State
  const [iaProvedor, setIaProvedor] = useState<ProvedorIA>('gemini');
  const [iaModelo, setIaModelo] = useState<string>('gemini-2.5-flash');
  const [iaApiKey, setIaApiKey] = useState<string>('');
  const [modelosDisponiveis, setModelosDisponiveis] = useState<ModeloIA[]>([]);
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean>(false);
  const [isSavingIA, setIsSavingIA] = useState<boolean>(false);
  const [iaFeedback, setIaFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  // Carrega configurações de IA e modelos existentes
  useEffect(() => {
    fetch('/api/ia/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.provedor) setIaProvedor(data.provedor);
        if (data.modelo) setIaModelo(data.modelo);
        if (data.apiKeyConfigurada) setIsKeyConfigured(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/ia/modelos?provedor=${iaProvedor}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setModelosDisponiveis(data);
          if (data.length > 0 && !data.some((m) => m.id === iaModelo)) {
            setIaModelo(data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [iaProvedor, iaModelo]);

  const handleLimpeza = async () => {
    if (!confirm(`Tem certeza que deseja excluir leituras e registros mais antigos que ${mesesRetencao} meses? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setIsCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch('/api/configuracao/limpar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meses: Number(mesesRetencao) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCleanResult({ success: true, msg: data.message });
      } else {
        setCleanResult({ success: false, msg: data.error || 'Erro executando limpeza.' });
      }
    } catch {
      setCleanResult({ success: false, msg: 'Falha de comunicação com o servidor.' });
    } finally {
      setIsCleaning(false);
    }
  };

  const handleSalvarIA = async () => {
    setIsSavingIA(true);
    setIaFeedback(null);
    try {
      const res = await fetch('/api/ia/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provedor: iaProvedor,
          modelo: iaModelo,
          ...(iaApiKey ? { apiKey: iaApiKey } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIaFeedback({ success: true, msg: 'Configuração de IA salva com sucesso!' });
        if (iaApiKey) {
          setIsKeyConfigured(true);
          setIaApiKey('');
        }
      } else {
        setIaFeedback({ success: false, msg: data.error || 'Erro ao salvar configuração.' });
      }
    } catch {
      setIaFeedback({ success: false, msg: 'Falha ao conectar com o servidor.' });
    } finally {
      setIsSavingIA(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center space-x-2">
            <Settings className="w-6 h-6 text-cyan-500" />
            <span className="text-slate-900 dark:text-white">Configurações do Sistema</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
            Gerencie inteligência artificial, políticas de retenção e preferências globais.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card IA */}
        <div className="glass-panel rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2.5 bg-purple-600/15 rounded-xl text-purple-500 shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Provedor de Inteligência Artificial</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Modelos para auditoria de SLA e desperdícios</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Provedor de IA
              </label>
              <select
                value={iaProvedor}
                onChange={(e) => setIaProvedor(e.target.value as ProvedorIA)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="gemini">Google Gemini (Oficial)</option>
                <option value="groq">Groq (Ultra-Rápido)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="anthropic">Anthropic (Claude 3.5)</option>
                <option value="openrouter">OpenRouter (Multi-Provedor)</option>
                <option value="ollama">Ollama (Local / Offline)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Modelo Selecionado
              </label>
              <select
                value={iaModelo}
                onChange={(e) => setIaModelo(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
              >
                {modelosDisponiveis.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Chave de API (API Key)
                </label>
                {isKeyConfigured && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ● Chave ativa salva
                  </span>
                )}
              </div>
              <input
                type="password"
                value={iaApiKey}
                onChange={(e) => setIaApiKey(e.target.value)}
                placeholder={isKeyConfigured ? 'Deixe em branco para manter a chave atual' : 'Cole sua chave de API aqui...'}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {iaFeedback && (
              <div
                className={`p-3 rounded-xl flex items-start space-x-2 text-xs font-semibold ${
                  iaFeedback.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                }`}
              >
                {iaFeedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{iaFeedback.msg}</span>
              </div>
            )}

            <button
              onClick={handleSalvarIA}
              disabled={isSavingIA}
              className="mt-2 w-full py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {isSavingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSavingIA ? 'Salvando...' : 'Salvar Configuração de IA'}</span>
            </button>
          </div>
        </div>

        {/* Card Retenção de Banco */}
        <div className="glass-panel rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-rose-600/15 rounded-xl text-rose-500 shadow-sm">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Retenção & Manutenção do Banco</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Expurgo seguro de histórico obsoleto</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Exclui leituras e logs de importação anteriores ao período determinado para preservar a velocidade do PostgreSQL e otimizar o índice de leituras diárias.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Manter histórico recente por:
                </label>
                <select
                  value={mesesRetencao}
                  onChange={(e) => setMesesRetencao(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="3">3 Meses</option>
                  <option value="6">6 Meses</option>
                  <option value="12">12 Meses</option>
                  <option value="24">24 Meses</option>
                </select>
              </div>

              {cleanResult && (
                <div
                  className={`p-3 rounded-xl flex items-start space-x-2 text-xs font-semibold ${
                    cleanResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                  }`}
                >
                  {cleanResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{cleanResult.msg}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleLimpeza}
            disabled={isCleaning}
            className="mt-4 w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>{isCleaning ? 'Executando expurgo...' : 'Executar Limpeza Manual Agora'}</span>
          </button>
        </div>

        {/* Card Alertas (Futuro) */}
        <div className="glass-panel rounded-2xl p-5 relative overflow-hidden md:col-span-2">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 bg-blue-600/15 rounded-xl text-blue-500 shadow-sm">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Alertas por E-mail (SMTP Corporativo)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Notificações automáticas para violação de SLA</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            O envio de e-mails em lote utiliza o servidor central configurado no ambiente.
          </p>
        </div>
      </div>
    </div>
  );
};
