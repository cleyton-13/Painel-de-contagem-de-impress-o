'use client';

import React, { useEffect, useState } from 'react';
import {
  X, Sparkles, Download, Settings2, Loader2, RefreshCw, AlertCircle,
  CheckCircle2, KeyRound, Send,
} from 'lucide-react';
import { ConfiguracaoIA, ModeloIA, ProvedorIA, RespostaAnaliseIA } from '@/lib/types';

interface AIAnalysisModalProps {
  open: boolean;
  onClose: () => void;
}

// Renderizador leve de markdown para o relatório da IA
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`ul-${key++}`} className="space-y-1 my-2">
          {listItems.map((li, i) => {
            const isBoldHeader = li.startsWith('**');
            return (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="text-cyan-400 mt-1 shrink-0">•</span>
                <span className={isBoldHeader ? 'font-semibold text-slate-900 dark:text-slate-200' : ''}>{li}</span>
              </li>
            );
          })}
        </ul>
      );
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const match = line.match(/^(#{1,4})\s+(.*)$/);
    const listMatch = line.match(/^[-*]\s+(.*)$/);

    if (match) {
      flushList();
      const level = match[1].length;
      const content = match[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[level - 1];
      nodes.push(
        <Tag key={`h-${key++}`} className={`font-bold text-slate-900 dark:text-white mt-4 mb-2 ${level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base'}`}>
          <span dangerouslySetInnerHTML={{ __html: content }} />
        </Tag>
      );
    } else if (listMatch) {
      listItems.push(listMatch[1]);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      const content = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      nodes.push(
        <p key={`p-${key++}`} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed my-1.5">
          <span dangerouslySetInnerHTML={{ __html: content }} />
        </p>
      );
    }
  }
  flushList();
  return nodes;
}

const PROVIDERS: Array<{ id: ProvedorIA; label: string }> = [
  { id: 'groq', label: 'Groq (gratuito)' },
  { id: 'openai', label: 'OpenAI (ChatGPT)' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'openrouter', label: 'OpenRouter (gratuito)' },
  { id: 'ollama', label: 'Ollama (Local Offline)' },
];

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({ open, onClose }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<RespostaAnaliseIA | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
  }, [open]);

  const generateAnalysis = async () => {
    setError(null);
    setResult(null);
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ia/analise', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Falha ao gerar análise.');
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar análise.');
    } finally {
      setAnalyzing(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const content = `# Análise de IA - Painel de Impressoras BI\n\nGerado com ${result.provedor} (${result.modelo}) em ${result.duracaoMs}ms\n\n${result.texto}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analise_ia_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Análise de IA</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ollama (Local Offline) • llama3.1
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 rounded-lg p-3 mb-4 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <button
              onClick={generateAnalysis}
              disabled={analyzing}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? 'Gerando análise...' : 'Gerar Análise de IA'}
            </button>
            {result && (
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Baixar Relatório (.md)
              </button>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 animate-fadeIn">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {result.provedor} <span className="text-slate-500">•</span> {result.modelo}
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">gerado em {(result.duracaoMs / 1000).toFixed(1)}s</span>
              </div>
              <div className="space-y-1">
                {renderMarkdown(result.texto)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
