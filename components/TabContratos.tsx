'use client';

import React, { useState } from 'react';
import { GitMerge, AlertTriangle, Building2, Trash2 } from 'lucide-react';
import { PerfilFranquia, Unidade } from '@/lib/types';

interface TabContratosProps {
  contratos: PerfilFranquia[];
  unidades: Unidade[];
  onSaveContrato: (contrato: Partial<PerfilFranquia>) => Promise<void>;
  onAssignContrato: (unidadeId: string, contratoId: string | null) => Promise<void>;
  onMergeUnidades: (origemId: string, destinoId: string) => Promise<{ success: boolean; message: string }>;
  onDeleteUnidade: (unidadeId: string, confirmNome: string) => Promise<{ success: boolean; message: string }>;
}

export const TabContratos: React.FC<TabContratosProps> = ({
  contratos,
  unidades,
  onSaveContrato,
  onAssignContrato,
  onMergeUnidades,
  onDeleteUnidade
}) => {
  // Merge modal state
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [mergeMessage, setMergeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Unidade | null>(null);
  const [deleteConfirmNome, setDeleteConfirmNome] = useState('');
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Safety popup for tariff > 1.50
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [pendingContratoForm, setPendingContratoForm] = useState<Partial<PerfilFranquia> | null>(null);

  // Contract form state
  const [formNome, setFormNome] = useState('');
  const [formTarifaPB, setFormTarifaPB] = useState(0.04);
  const [formTarifaColor, setFormTarifaColor] = useState(0.25);
  const [formTemFixa, setFormTemFixa] = useState(true);
  const [formValorFixo, setFormValorFixo] = useState(500);
  const [formCotaPB, setFormCotaPB] = useState(5000);
  const [formCotaColor, setFormCotaColor] = useState(1000);
  const [formExcedentePB, setFormExcedentePB] = useState(0.05);
  const [formExcedenteColor, setFormExcedenteColor] = useState(0.30);
  const [formPrecoResma, setFormPrecoResma] = useState(28.0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEditContrato = (c: PerfilFranquia) => {
    setEditingId(c.id);
    setFormNome(c.nome);
    setFormTarifaPB(c.tarifaAvulsaPB);
    setFormTarifaColor(c.tarifaAvulsaColor);
    setFormTemFixa(c.temFranquiaFixa);
    setFormValorFixo(c.valorFixoMensal || 0);
    setFormCotaPB(c.cotaPB || 0);
    setFormCotaColor(c.cotaColor || 0);
    setFormExcedentePB(c.excedentePB || 0);
    setFormExcedenteColor(c.excedenteColor || 0);
    setFormPrecoResma(c.precoResmaPapel);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormNome('');
    setFormTarifaPB(0.04);
    setFormTarifaColor(0.25);
    setFormTemFixa(true);
    setFormValorFixo(500);
    setFormCotaPB(5000);
    setFormCotaColor(1000);
    setFormExcedentePB(0.05);
    setFormExcedenteColor(0.30);
    setFormPrecoResma(28.0);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const draft: Partial<PerfilFranquia> = {
      id: editingId || undefined,
      nome: formNome,
      tarifaAvulsaPB: parseFloat(Number(formTarifaPB).toFixed(4)),
      tarifaAvulsaColor: parseFloat(Number(formTarifaColor).toFixed(4)),
      temFranquiaFixa: formTemFixa,
      valorFixoMensal: formTemFixa ? parseFloat(Number(formValorFixo).toFixed(2)) : 0,
      cotaPB: formTemFixa ? Number(formCotaPB) : 0,
      cotaColor: formTemFixa ? Number(formCotaColor) : 0,
      excedentePB: formTemFixa ? parseFloat(Number(formExcedentePB).toFixed(4)) : 0,
      excedenteColor: formTemFixa ? parseFloat(Number(formExcedenteColor).toFixed(4)) : 0,
      precoResmaPapel: parseFloat(Number(formPrecoResma).toFixed(2))
    };

    // Check Safety Validation Rule: Tariff > R$ 1,50
    if (draft.tarifaAvulsaPB! > 1.50 || draft.tarifaAvulsaColor! > 1.50 || (draft.excedentePB && draft.excedentePB > 1.50) || (draft.excedenteColor && draft.excedenteColor > 1.50)) {
      setPendingContratoForm(draft);
      setIsSafetyModalOpen(true);
      return;
    }

    await onSaveContrato(draft);
    resetForm();
  };

  const confirmSafetySave = async () => {
    if (pendingContratoForm) {
      await onSaveContrato(pendingContratoForm);
      setPendingContratoForm(null);
    }
    setIsSafetyModalOpen(false);
    resetForm();
  };

  const handleExecuteMerge = async () => {
    if (!origemId || !destinoId) {
      setMergeMessage({ type: 'error', text: 'Selecione a unidade origem e destino.' });
      return;
    }
    const res = await onMergeUnidades(origemId, destinoId);
    if (res.success) {
      setMergeMessage({ type: 'success', text: res.message });
      setTimeout(() => {
        setIsMergeModalOpen(false);
        setMergeMessage(null);
        setOrigemId('');
        setDestinoId('');
      }, 2500);
    } else {
      setMergeMessage({ type: 'error', text: res.message });
    }
  };

  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmNome.trim() !== deleteTarget.nome) {
      setDeleteMessage({ type: 'error', text: 'O nome digitado nao confere com a unidade selecionada.' });
      return;
    }
    setIsDeleting(true);
    setDeleteMessage(null);
    const res = await onDeleteUnidade(deleteTarget.id, deleteTarget.nome);
    setIsDeleting(false);
    if (res.success) {
      setDeleteMessage({ type: 'success', text: res.message });
      setTimeout(() => {
        setDeleteTarget(null);
        setDeleteConfirmNome('');
        setDeleteMessage(null);
      }, 2000);
    } else {
      setDeleteMessage({ type: 'error', text: res.message });
    }
  };

  const openDeleteModal = (u: Unidade) => {
    setDeleteTarget(u);
    setDeleteConfirmNome('');
    setDeleteMessage(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Top Banner with Merge Tool trigger */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">Gestão de Franquias & Ferramenta de Fusão</h3>
          <p className="text-xs text-slate-500 dark:text-slate-300">Configure perfis de tarifa e unifique filiais duplicadas</p>
        </div>
        <button
          onClick={() => setIsMergeModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-900/30 transition-all cursor-pointer"
        >
          <GitMerge className="w-4 h-4" />
          <span>Fundir Unidades Duplicadas (Merge Tool)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Existing Contracts Grid (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Perfis de Franquia Cadastrados</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contratos.map(c => (
              <div key={c.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-lg space-y-3 relative group">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{c.nome}</h4>
                  <button
                    onClick={() => startEditContrato(c)}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-300 rounded text-xs font-semibold cursor-pointer"
                  >
                    Editar
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Tarifa Avulsa P&B:</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">R$ {c.tarifaAvulsaPB.toFixed(4)} /pág</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Tarifa Avulsa Color:</span>
                    <span className="font-mono text-pink-600 dark:text-pink-400 font-bold">R$ {c.tarifaAvulsaColor.toFixed(4)} /pág</span>
                  </div>
                  {c.temFranquiaFixa && (
                    <>
                      <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-slate-600 dark:text-slate-300">Valor Fixo Mensal:</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">R$ {(c.valorFixoMensal || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-300">Cota Inclusa P&B / Color:</span>
                        <span className="font-mono text-slate-700 dark:text-slate-200">{c.cotaPB} / {c.cotaColor} pág</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-300">Excedente P&B / Color:</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">R$ {c.excedentePB} / R$ {c.excedenteColor}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-300">Resma de Papel (500fl):</span>
                    <span className="font-mono text-amber-600 dark:text-amber-300">R$ {c.precoResmaPapel.toFixed(2)}</span>
                  </div>
                </div>

              </div>
            ))}
          </div>

          {/* Branch-to-Contract Assignment Card */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-lg space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>Vinculação de Contratos às Unidades</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unidades.map(u => (
                <div key={u.id} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white block truncate">{u.nome}</span>
                    {u.aliases && u.aliases.length > 0 && (
                      <span className="text-xs text-purple-400 font-mono">
                        Aliases: {u.aliases.map(a => a.alias).join(', ')}
                      </span>
                    )}
                    <span className="text-xs text-slate-500 block truncate">
                      {u.impressoras || 0} impressoras · {u.leituras || 0} leituras
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <select
                      value={u.perfilFranquiaId || ''}
                      onChange={(e) => onAssignContrato(u.id, e.target.value || null)}
                      className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                    >
                      <option value="">Sem Contrato</option>
                      {contratos.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => openDeleteModal(u)}
                      title={`Excluir unidade ${u.nome}`}
                      className="p-1.5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950 text-slate-500 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 border border-slate-300 dark:border-slate-600 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Contract Form (1 col) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span>{editingId ? 'Editar Perfil' : 'Novo Perfil de Franquia'}</span>
            {editingId && (
              <button onClick={resetForm} className="text-xs text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline">
                Cancelar
              </button>
            )}
          </h3>

          <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
            <div>
              <label className="text-slate-700 dark:text-slate-300 font-semibold block mb-1">Nome do Perfil:</label>
              <input
                type="text"
                required
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Contrato Filiais Zona Sul"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 dark:text-slate-300 block mb-1">Tarifa P&B (R$/pág):</label>
                <input
                  type="number"
                  step="0.001"
                  value={formTarifaPB}
                  onChange={(e) => setFormTarifaPB(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg font-mono outline-none"
                />
              </div>
              <div>
                <label className="text-slate-600 dark:text-slate-300 block mb-1">Tarifa Color (R$/pág):</label>
                <input
                  type="number"
                  step="0.001"
                  value={formTarifaColor}
                  onChange={(e) => setFormTarifaColor(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg font-mono outline-none"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="temFixa"
                checked={formTemFixa}
                onChange={(e) => setFormTemFixa(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded cursor-pointer"
              />
              <label htmlFor="temFixa" className="text-slate-800 dark:text-slate-200 font-semibold cursor-pointer">
                Possui Franquia Mensal Fixa
              </label>
            </div>

            {formTemFixa && (
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="text-slate-600 dark:text-slate-300 block mb-1">Valor Fixo Mensal (R$):</label>
                  <input
                    type="number"
                    step="1"
                    value={formValorFixo}
                    onChange={(e) => setFormValorFixo(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 font-bold rounded-lg font-mono outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-600 dark:text-slate-300 block mb-1">Cota P&B (pág):</label>
                    <input
                      type="number"
                      value={formCotaPB}
                      onChange={(e) => setFormCotaPB(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 dark:text-slate-300 block mb-1">Cota Color (pág):</label>
                    <input
                      type="number"
                      value={formCotaColor}
                      onChange={(e) => setFormCotaColor(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg font-mono outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-600 dark:text-slate-300 block mb-1">Excedente P&B (R$):</label>
                    <input
                      type="number"
                      step="0.001"
                      value={formExcedentePB}
                      onChange={(e) => setFormExcedentePB(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 dark:text-slate-300 block mb-1">Excedente Color (R$):</label>
                    <input
                      type="number"
                      step="0.001"
                      value={formExcedenteColor}
                      onChange={(e) => setFormExcedenteColor(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg font-mono outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-slate-600 dark:text-slate-300 block mb-1">Preço Médio Resma Papel (500fl R$):</label>
              <input
                type="number"
                step="0.5"
                value={formPrecoResma}
                onChange={(e) => setFormPrecoResma(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-amber-600 dark:text-amber-300 font-bold rounded-lg font-mono outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-all cursor-pointer"
            >
              {editingId ? 'Salvar Alterações' : 'Cadastrar Perfil de Franquia'}
            </button>
          </form>
        </div>

      </div>

      {/* MERGE TOOL MODAL */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center space-x-3 text-purple-600 dark:text-purple-400">
              <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-xl border border-purple-300 dark:border-purple-800">
                <GitMerge className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ferramenta de Fusão (Merge Tool)</h3>
                <span className="text-xs text-purple-600 dark:text-purple-300">Unificar Filiais Duplicadas e Registrar Alias</span>
              </div>
            </div>

            <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 leading-relaxed">
              Esta ferramenta move todas as impressoras da <strong>Unidade Origem</strong> para a <strong>Unidade Destino</strong> e registra automaticamente a string sanitizada da Origem como um <strong>Alias ativo</strong> na Destino.
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-700 dark:text-slate-300 font-bold block mb-1">1. Unidade Duplicada (Origem a ser removida):</label>
                <select
                  value={origemId}
                  onChange={(e) => setOrigemId(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-xl outline-none"
                >
                  <option value="">Selecione a unidade origem...</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-700 dark:text-slate-300 font-bold block mb-1">2. Unidade Principal (Destino que receberá os dados):</label>
                <select
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-xl outline-none"
                >
                  <option value="">Selecione a unidade destino...</option>
                  {unidades.filter(u => u.id !== origemId).map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {mergeMessage && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${mergeMessage.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
                {mergeMessage.text}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => { setIsMergeModalOpen(false); setMergeMessage(null); }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteMerge}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-purple-900/40 cursor-pointer"
              >
                Executar Fusão de Unidades
              </button>
            </div>

          </div>
        </div>
      )}

      {/* DELETE UNIT MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-red-300 dark:border-red-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
              <div className="p-2 bg-red-100 dark:bg-red-950 rounded-xl border border-red-300 dark:border-red-800">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Excluir Unidade</h3>
                <span className="text-xs text-red-600 dark:text-red-300 font-semibold">Operação irreversível</span>
              </div>
            </div>

            <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/80 rounded-xl text-xs text-red-900 dark:text-red-100 leading-relaxed font-medium space-y-1">
              <p>Você está prestes a excluir permanentemente a unidade:</p>
              <p className="font-mono text-red-600 dark:text-red-300 font-extrabold text-sm">{deleteTarget.nome}</p>
              <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-900 rounded font-mono text-red-600 dark:text-red-300 text-xs">
                Serão removidos: {deleteTarget.impressoras || 0} impressoras · {deleteTarget.leituras || 0} leituras
                {deleteTarget.aliases && deleteTarget.aliases.length > 0 ? ` · ${deleteTarget.aliases.length} aliases` : ''}
              </div>
              <p>Esta ação não pode ser desfeita. Para confirmar, digite o nome exato da unidade abaixo.</p>
            </div>

            <input
              type="text"
              value={deleteConfirmNome}
              onChange={(e) => setDeleteConfirmNome(e.target.value)}
              placeholder={`Digite: ${deleteTarget.nome}`}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-red-500"
            />

            {deleteMessage && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${deleteMessage.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
                {deleteMessage.text}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmNome(''); setDeleteMessage(null); }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={isDeleting || deleteConfirmNome.trim() !== deleteTarget.nome}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold shadow-lg shadow-red-900/40 cursor-pointer"
              >
                {isDeleting ? 'Excluindo...' : 'Excluir Definitivamente'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TARIFF SAFETY POPUP (> R$ 1,50) */}
      {isSafetyModalOpen && pendingContratoForm && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-600 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center space-x-3 text-amber-600 dark:text-amber-400">
              <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-xl border border-amber-300 dark:border-amber-700">
                <AlertTriangle className="w-7 h-7 animate-bounce" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Validação de Segurança de Tarifa</h3>
                <span className="text-xs text-amber-600 dark:text-amber-300 font-semibold">Alerta de Valor Elevado</span>
              </div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs text-amber-900 dark:text-amber-100 leading-relaxed font-medium">
              Você digitou uma tarifa unitária <strong>superior a R$ 1,50 por página</strong>.
              <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-900 rounded font-mono text-amber-600 dark:text-amber-300">
                Valor informado: R$ {pendingContratoForm.tarifaAvulsaPB || pendingContratoForm.tarifaAvulsaColor} /pág
              </div>
              <p className="mt-2">
                Confirme se este valor está correto ou se houve um erro de digitação (ex.: digitou R$ 4,00 em vez de R$ 0,04).
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsSafetyModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Corrigir Valor
              </button>
              <button
                onClick={confirmSafetySave}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg cursor-pointer"
              >
                Confirmar R$ {pendingContratoForm.tarifaAvulsaPB || pendingContratoForm.tarifaAvulsaColor}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
