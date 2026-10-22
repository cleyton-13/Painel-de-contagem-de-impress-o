'use client';

import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound, ArrowRight } from 'lucide-react';

interface LoginModalProps {
  onSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess();
      } else {
        setError(data.error || 'Senha incorreta.');
      }
    } catch {
      setError('Erro de conexão ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-8 text-white relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/40 rounded-2xl flex items-center justify-center text-blue-400 mb-4 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Painel de Impressoras BI</h2>
          <p className="text-sm text-slate-400 mt-1">Acesso protegido. Digite a senha administrativa.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha de acesso..."
                autoFocus
                className="w-full pl-11 pr-4 py-3 bg-slate-800/90 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            {error && (
              <p className="text-xs text-rose-400 mt-2 flex items-center gap-1.5 animate-in fade-in">
                <Lock className="w-3.5 h-3.5" /> {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Entrar no Painel</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-500">SPX Imagem · Autenticação Criptografada</p>
        </div>
      </div>
    </div>
  );
};
