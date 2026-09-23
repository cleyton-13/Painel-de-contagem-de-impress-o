import React, { useState, useEffect } from 'react';
import { Settings, Save, Trash2, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export const TabConfiguracoes: React.FC = () => {
  const [mesesRetencao, setMesesRetencao] = useState('6');
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ success: boolean; msg: string } | null>(null);

  const handleLimpeza = async () => {
    if (!confirm(`Tem certeza que deseja excluir todos os logs mais antigos que ${mesesRetencao} meses? Esta ação não pode ser desfeita.`)) {
      return;
    }
    
    setIsCleaning(true);
    setCleanResult(null);
    try {
      const res = await fetch('/api/configuracao/limpar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meses: mesesRetencao })
      });
      const data = await res.json();
      if (data.success) {
        setCleanResult({ success: true, msg: data.message });
      } else {
        setCleanResult({ success: false, msg: data.error || 'Erro desconhecido.' });
      }
    } catch (err) {
      setCleanResult({ success: false, msg: 'Falha na comunicação com o servidor.' });
    } finally {
      setIsCleaning(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center space-x-2">
            <Settings className="w-6 h-6 text-cyan-400" />
            <span className="text-slate-900 dark:text-white">Configuracoes do Sistema</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
            Gerencie preferencias globais, alertas e politicas de retencao.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card Alertas */}
        <div className="glass-panel rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Alertas por E-mail</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Configure o disparo de e-mails automaticos quando impressoras estiverem offline ou limites de contrato forem atingidos.
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Servidor SMTP</label>
              <input type="text" placeholder="Ex: smtp.gmail.com" disabled className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-slate-300 opacity-60 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">E-mail de Origem</label>
              <input type="email" placeholder="painelbi@suaempresa.com" disabled className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-slate-300 opacity-60 cursor-not-allowed" />
            </div>
            <button disabled className="mt-2 w-full py-2 bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-lg text-sm font-bold opacity-60 cursor-not-allowed flex items-center justify-center space-x-2">
              <Save className="w-4 h-4" />
              <span>Salvar Configuração (Em Breve)</span>
            </button>
          </div>
        </div>

        {/* Card Retenção de Banco */}
        <div className="glass-panel rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-red-600/20 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Retenção de Dados</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Configure a exclusao automatica de logs e leituras muito antigas para evitar que o banco de dados fique lento e pesado.
          </p>

          <div className="space-y-4">
             <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Manter historico por (Meses)</label>
              <select 
                value={mesesRetencao}
                onChange={(e) => setMesesRetencao(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="3">3 Meses</option>
                <option value="6">6 Meses</option>
                <option value="12">12 Meses</option>
                <option value="24">24 Meses</option>
              </select>
            </div>
            
            {cleanResult && (
              <div className={`p-3 rounded-lg flex items-start space-x-2 text-xs font-semibold ${cleanResult.success ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'}`}>
                {cleanResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{cleanResult.msg}</span>
              </div>
            )}

            <button 
              onClick={handleLimpeza}
              disabled={isCleaning}
              className="mt-2 w-full py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(225,29,72,0.3)] transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span>{isCleaning ? 'Limpando banco de dados...' : 'Executar Limpeza Manual Agora'}</span>
            </button>
          </div>
        </div>

        {/* Card IA */}
        <div className="glass-panel rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Settings className="w-5 h-5 text-purple-400" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">Inteligência Artificial</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Configure a chave de API para habilitar a geração de relatórios avançados.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Provedor</label>
              <select id="iaProvedor" defaultValue="gemini" className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 transition-colors">
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Modelo</label>
              <select id="iaModelo" defaultValue="gemini-2.0-flash" className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 transition-colors">
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="llama3.1">Llama 3.1 (Local)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Chave de API (API Key)</label>
              <input id="iaApiKey" type="password" placeholder="Cole sua chave aqui..." className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 outline-none focus:border-cyan-500 transition-colors" />
            </div>
            <button 
              onClick={async () => {
                const prov = (document.getElementById('iaProvedor') as HTMLSelectElement).value;
                const mod = (document.getElementById('iaModelo') as HTMLSelectElement).value;
                const key = (document.getElementById('iaApiKey') as HTMLInputElement).value;
                try {
                  const res = await fetch('/api/ia/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provedor: prov, modelo: mod, apiKey: key })
                  });
                  if (res.ok) alert('Configuração de IA salva com sucesso!');
                  else alert('Erro ao salvar configuração.');
                } catch (e) {
                  alert('Erro de comunicação.');
                }
              }}
              className="mt-2 w-full py-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Configuração de IA</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
