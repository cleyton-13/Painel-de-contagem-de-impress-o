'use client';

import React, { useState } from 'react';
import {
  X, Sparkles, Download, Loader2, AlertCircle,
} from 'lucide-react';
import { RespostaAnaliseIA } from '@/lib/types';

interface AIAnalysisModalProps {
  open: boolean;
  onClose: () => void;
}

// Renderizador seguro sem dangerouslySetInnerHTML para prevenir qualquer risco de XSS
function renderInlineText(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={`${baseKey}-t-${idx++}`}>{text.substring(lastIdx, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`${baseKey}-b-${idx++}`} className="font-semibold text-slate-900 dark:text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={`${baseKey}-i-${idx++}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={`${baseKey}-t-${idx++}`}>{text.substring(lastIdx)}</span>);
  }
  return parts;
}

function renderMarkdownSafe(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let lineKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`ul-${lineKey++}`} className="space-y-1.5 my-2.5 pl-2">
          {listItems.map((li, i) => (
            <li key={`li-${lineKey}-${i}`} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <span className="text-cyan-500 mt-1 shrink-0 text-xs">●</span>
              <span>{renderInlineText(li, `li-${lineKey}-${i}`)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
    const listMatch = line.match(/^[-*]\s+(.*)$/);

    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[level - 1];
      const sizeClasses =
        level === 1
          ? 'text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-4 mb-2'
          : level === 2
          ? 'text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-3 mb-1.5'
          : 'text-sm sm:text-base font-semibold text-slate-900 dark:text-white mt-2 mb-1';

      nodes.push(
        <Tag key={`h-${lineKey++}`} className={sizeClasses}>
          {renderInlineText(content, `h-${lineKey}`)}
        </Tag>
      );
    } else if (listMatch) {
      listItems.push(listMatch[1]);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      nodes.push(
        <p key={`p-${lineKey++}`} className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-1.5">
          {renderInlineText(line, `p-${lineKey}`)}
        </p>
      );
    }
  }
  flushList();
  return nodes;
}

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({ open, onClose }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<RespostaAnaliseIA | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    setResult(null);
    onClose();
  };

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
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analise_ia_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-4xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-xl text-white shadow-md shadow-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Análise Inteligente da Frota</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {result
                  ? `${result.provedor.toUpperCase()} • ${result.modelo}`
                  : 'Auditoria de padrões, desperdícios de cor e anomalias de SLA'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl p-3.5 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={generateAnalysis}
              disabled={analyzing}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{analyzing ? 'Analisando dados do parque...' : 'Gerar Nova Análise com IA'}</span>
            </button>
            {result && (
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Exportar Relatório (.md)</span>
              </button>
            )}
          </div>

          {/* Resultado */}
          {result && (
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {result.provedor.toUpperCase()} • {result.modelo}
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  concluído em {(result.duracaoMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="space-y-1">
                {renderMarkdownSafe(result.texto)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
