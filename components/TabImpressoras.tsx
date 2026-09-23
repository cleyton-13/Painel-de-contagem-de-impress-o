'use client';

import React, { useState } from 'react';
import { Search, Edit3, Check, X, RotateCcw, Filter, Settings } from 'lucide-react';
import { Impressora } from '@/lib/types';

interface TabImpressorasProps {
  impressoras: Impressora[];
  onUpdateApelido: (serial: string, novoApelido: string) => void;
  onUpdateConfig?: (serial: string, config: { preExistente?: boolean; leituraReferenciaPB?: number | null; leituraReferenciaColor?: number | null }) => void;
  showCosts?: boolean;
  hideCurrency?: boolean;
  usarSeparacaoCores?: boolean;
}

export const TabImpressoras: React.FC<TabImpressorasProps> = ({
  impressoras,
  onUpdateApelido,
  onUpdateConfig,
  usarSeparacaoCores = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [editingSerial, setEditingSerial] = useState<string | null>(null);
  const [tempApelido, setTempApelido] = useState<string>('');
  const [showConfigModal, setShowConfigModal] = useState<string | null>(null);
  const [tempPreExistente, setTempPreExistente] = useState(false);
  const [tempRefPB, setTempRefPB] = useState('');
  const [tempRefColor, setTempRefColor] = useState('');


  // Filtering + ordem alfabética (unidade → apelido/serial)
  const filtered = impressoras.filter(imp => {
    const matchesSearch =
      imp.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      imp.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      imp.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (imp.apelido && imp.apelido.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (imp.unidadeNome && imp.unidadeNome.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ? true :
      statusFilter === 'RESET' ? imp.resetPlaca :
      imp.status === statusFilter;

    return matchesSearch && matchesStatus;
  }).sort((a, b) =>
    (a.unidadeNome || '').localeCompare(b.unidadeNome || '', 'pt-BR') ||
    (a.apelido || a.serial).localeCompare(b.apelido || b.serial, 'pt-BR')
  );



  const startEdit = (imp: Impressora) => {
    setEditingSerial(imp.serial);
    setTempApelido(imp.apelido || '');
  };

  const startConfigEdit = (imp: Impressora) => {
    setShowConfigModal(imp.serial);
    setTempPreExistente(imp.preExistente || false);
    setTempRefPB(imp.leituraReferenciaPB != null ? String(imp.leituraReferenciaPB) : '');
    setTempRefColor(imp.leituraReferenciaColor != null ? String(imp.leituraReferenciaColor) : '');
  };

  const cancelEdit = () => {
    setEditingSerial(null);
    setTempApelido('');
  };

  const saveEdit = (serial: string) => {
    onUpdateApelido(serial, tempApelido);
    setEditingSerial(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Top Filter & Search Controls */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500 dark:text-slate-300 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar por Serial, Apelido, Modelo, IP ou Unidade..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto py-1">
          <Filter className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
          {[
            { id: 'ALL', label: 'Todos os Equipamentos' },
            { id: 'Online', label: 'Online' },
            { id: 'Offline', label: 'Offline' },
            { id: 'RESET', label: 'Placa Resetada' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => {
                setStatusFilter(f.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

      </div>

      {/* Equipment Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Unidade</th>
                <th className="py-3.5 px-4 min-w-[200px]">Apelido / Setor (Editável)</th>
                <th className="py-3.5 px-4">Modelo</th>
                <th className="py-3.5 px-4">Serial</th>
                <th className="py-3.5 px-4">IP</th>
                <th className="py-3.5 px-4 w-12"><span className="sr-only">Config</span></th>
                <th className="py-3.5 px-4">Status</th>
                {usarSeparacaoCores && (
                  <>
                    <th className="py-3.5 px-4 text-right">Delta P&B</th>
                    <th className="py-3.5 px-4 text-right">Delta Color</th>
                  </>
                )}
                <th className="py-3.5 px-4 text-right">Total Impresso</th>
                <th className="py-3.5 px-4 text-right">Custo Est. (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-200 font-medium">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={usarSeparacaoCores ? 11 : 9} className="py-8 text-center text-slate-500 dark:text-slate-300 font-normal">
                    Nenhuma impressora encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filtered.map((imp) => {
                  const isEditing = editingSerial === imp.serial;
                  return (
                    <tr key={imp.serial} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      
                      {/* Unidade */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {imp.unidadeNome}
                      </td>

                      {/* Apelido / Setor (Editable Inline) */}
                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={tempApelido}
                              onChange={(e) => setTempApelido(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(imp.serial);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                              className="px-2 py-1 bg-white dark:bg-slate-950 border border-blue-500 text-slate-900 dark:text-white rounded text-xs outline-none w-full"
                            />
                            <button
                              onClick={() => saveEdit(imp.serial)}
                              className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950 rounded cursor-pointer"
                              title="Salvar Apelido"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950 rounded cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 group/edit cursor-pointer" onClick={() => startEdit(imp)}>
                            <span className="font-semibold text-cyan-600 dark:text-cyan-300">
                              {imp.apelido || 'Clique para adicionar setor...'}
                            </span>
                            <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover/edit:text-cyan-600 dark:group-hover/edit:text-cyan-400 transition-colors" />
                          </div>
                        )}
                      </td>

                       {/* Modelo */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {imp.modelo}
                      </td>

                      {/* Serial */}
                      <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-300">
                        {imp.serial}
                      </td>

                      {/* IP */}
                      <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-300">
                        {imp.ip}
                      </td>

                      {/* Config Button */}
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => startConfigEdit(imp)}
                          className="p-1.5 text-slate-500 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer"
                          title={imp.preExistente ? 'Editr Config (Pré-existente)' : 'Editar Config (Nova)'}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </td>

                       {/* Status & Badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col space-y-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider w-max ${
                              imp.status === 'Online'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                                : imp.status === 'Offline'
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {imp.status}
                          </span>

                          {/* Placa Resetada Badge */}
                          {imp.resetPlaca && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/90 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-bold w-max">
                              <RotateCcw className="w-3 h-3 text-amber-400" />
                              <span>Placa Resetada no Período</span>
                            </span>
                          )}

                          {/* Quebra por Tipo Badge */}
                          {imp.quebraPorTipoIndisponivel && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 text-xs font-bold w-max">
                              <span>⚠ PB/Color travado — usando Total</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Delta P&B / Delta Color */}
                      {usarSeparacaoCores && (
                        <>
                          <td className="py-3.5 px-4 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">
                            {imp.consumoPBDelta.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-pink-600 dark:text-pink-400 font-semibold">
                            {imp.consumoColorDelta.toLocaleString('pt-BR')}
                          </td>
                        </>
                      )}

                      {/* Total Impresso */}
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 dark:text-white">
                        {imp.totalImpresso.toLocaleString('pt-BR')}
                      </td>

                      {/* Custo Estimado */}
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        R$ {imp.custoEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>



      </div>

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Configuração: {showConfigModal}</h3>
            <div className="space-y-4 text-sm">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tempPreExistente}
                  onChange={(e) => setTempPreExistente(e.target.checked)}
                  className="w-4 h-4 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-slate-700 dark:text-slate-200">Pré-existente (marco zero na primeira leitura)</span>
              </label>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">Leitura Referência PB (odômetro no onboarding)</label>
                <input
                  type="number"
                  value={tempRefPB}
                  onChange={(e) => setTempRefPB(e.target.value)}
                  placeholder="deixe vazio para usar a primeira leitura"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1">Leitura Referência Color (odômetro no onboarding)</label>
                <input
                  type="number"
                  value={tempRefColor}
                  onChange={(e) => setTempRefColor(e.target.value)}
                  placeholder="deixe vazio para usar a primeira leitura"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded text-sm outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p>• <strong>Desmarcado</strong> = impressora nova (conta consumo do 1º dia).</p>
                <p>• <strong>Marcado</strong> = pré-existente (1º dia = marco zero, consumo a partir do 2º dia).</p>
                <p>• <strong>Referências preenchidas</strong> sobrescrevem o marco zero.</p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowConfigModal(null)}
                className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const serial = showConfigModal;
                  const config: { preExistente?: boolean; leituraReferenciaPB?: number | null; leituraReferenciaColor?: number | null } = {
                    preExistente: tempPreExistente,
                  };
                  config.leituraReferenciaPB = tempRefPB ? Number(tempRefPB) : null;
                  config.leituraReferenciaColor = tempRefColor ? Number(tempRefColor) : null;
                  onUpdateConfig?.(serial, config);
                  setShowConfigModal(null);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
