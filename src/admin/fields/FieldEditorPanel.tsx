import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, AlertCircle, Plus, Trash2, GripVertical, Shield, Lock, MoreHorizontal, ArrowUp, ArrowDown, Palette, Pencil, Star, Calculator } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import type { FieldDefinition, FieldFormData, FieldType, ChoiceOption, CalcFormula, CalculationConfig } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import CalcBuilderModal, { summarizeCalculation } from './CalcBuilderModal';
import { useToast } from '../../app/context/ToastContext';
import { supabase } from '../../lib/supabase';

// ─── Status manager types ─────────────────────────────────────────────────────

interface StatecodeDef {
  statecode_id: string;
  state_value: number;
  display_label: string;
  is_active_state: boolean;
  sort_order: number;
  is_system: boolean;
}

interface StatusReasonDef {
  status_reason_id: string;
  statecode_id: string;
  reason_value: number;
  display_label: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_system: boolean;
}

const PRESET_COLORS = ['#10B981','#3B82F6','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16','#F97316','#8B5CF6','#6B7280'];

// ── Shared hook ───────────────────────────────────────────────────────────────

function useStatusData(entityId: string) {
  const [statecodes, setStatecodes] = useState<StatecodeDef[]>([]);
  const [reasons, setReasons] = useState<StatusReasonDef[]>([]);

  const load = useCallback(async () => {
    const [scRes, srRes] = await Promise.all([
      supabase.from('statecode_definition').select('*').eq('entity_definition_id', entityId).order('sort_order'),
      supabase.from('status_reason_definition').select('*').eq('entity_definition_id', entityId).order('sort_order'),
    ]);
    setStatecodes((scRes.data ?? []) as StatecodeDef[]);
    setReasons((srRes.data ?? []) as StatusReasonDef[]);
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  const sortedStatecodes = [...statecodes].sort((a, b) => a.sort_order - b.sort_order);

  return { statecodes, setStatecodes, reasons, setReasons, sortedStatecodes };
}

// ── Row action menu ──────────────────────────────────────────────────────────

interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

function RowActionMenu({ actions }: { actions: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visible = actions.filter((a) => !a.disabled);
  if (visible.length === 0) return <span className="w-7" />;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = 172;
      const menuHeight = visible.length * 36 + 8;
      let top = rect.bottom + 4;
      let left = rect.right - menuWidth;
      if (left < 8) left = 8;
      if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 4;
      setPos({ top, left });
    }
    setOpen((p) => !p);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`p-1.5 rounded transition-colors ${open ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[172px] bg-white rounded-lg border border-slate-200 shadow-lg py-1"
          style={{ top: pos.top, left: pos.left }}
        >
          {visible.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setOpen(false); a.onClick(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition-colors ${
                a.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Value editor modal ───────────────────────────────────────────────────────

interface ValueModalProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  valid: boolean;
  children: React.ReactNode;
}

function ValueModal({ title, onClose, onSave, saving, valid, children }: ValueModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-[14px] font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          {children}
        </div>
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[12px] font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !valid}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={13} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const modalInput = 'w-full px-3 py-2.5 text-[13px] border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors';
const modalInputDisabled = 'w-full px-3 py-2.5 text-[13px] border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed';

// ── Status field panel (read-only, Active=0, Inactive=1) ─────────────────────

function StatusFieldPanel() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500">
        <Lock size={11} className="shrink-0 text-slate-400" />
        This field is system-managed. Values are fixed and cannot be changed.
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_80px] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Name</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Value</span>
        </div>
        {[{ label: 'Active', value: 0, color: '#10B981' }, { label: 'Inactive', value: 1, color: '#6B7280' }].map((row) => (
          <div key={row.value} className="grid grid-cols-[1fr_80px] gap-2 items-center px-4 py-3 border-b border-slate-100 last:border-0 bg-white">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-[13px] font-medium text-slate-600">{row.label}</span>
            </div>
            <span className="text-[13px] text-slate-500 font-mono">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Statecode manager ────────────────────────────────────────────────────────

function StatecodeManager({ entityId }: { entityId: string }) {
  const { showError, showSuccess } = useToast();
  const { statecodes, setStatecodes, sortedStatecodes } = useStatusData(entityId);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [modalTarget, setModalTarget] = useState<StatecodeDef | null>(null);
  const [mName, setMName] = useState('');
  const [mVal, setMVal] = useState('');
  const [mActive, setMActive] = useState(true);

  const openAdd = () => {
    setModal('add');
    setModalTarget(null);
    setMName('');
    setMVal(String((statecodes.reduce((m, s) => Math.max(m, s.state_value), 0) + 1)));
    setMActive(true);
  };

  const openEdit = (sc: StatecodeDef) => {
    setModal('edit');
    setModalTarget(sc);
    setMName(sc.display_label);
    setMVal(String(sc.state_value));
    setMActive(sc.is_active_state);
  };

  const closeModal = () => { setModal(null); setModalTarget(null); };

  const handleSaveModal = async () => {
    const trimName = mName.trim();
    const valNum = parseInt(mVal, 10);
    if (!trimName || isNaN(valNum)) return;

    if (modal === 'add') {
      if (statecodes.some((s) => s.state_value === valNum)) { showError('Value already exists'); return; }
      setSaving(true);
      const maxSort = statecodes.reduce((m, s) => Math.max(m, s.sort_order), 0);
      const { data, error } = await supabase.from('statecode_definition').insert({
        entity_definition_id: entityId, state_value: valNum, display_label: trimName,
        is_active_state: mActive, sort_order: maxSort + 10, is_system: false,
      }).select().single();
      if (error) showError('Failed to add status value');
      else { setStatecodes((p) => [...p, data as StatecodeDef]); showSuccess('Status value added'); closeModal(); }
      setSaving(false);
    } else if (modal === 'edit' && modalTarget) {
      if (statecodes.some((s) => s.state_value === valNum && s.statecode_id !== modalTarget.statecode_id)) {
        showError('Value already exists'); return;
      }
      setSaving(true);
      const updates: Partial<StatecodeDef> = { display_label: trimName };
      if (!modalTarget.is_system) { updates.state_value = valNum; updates.is_active_state = mActive; }
      const { error } = await supabase.from('statecode_definition').update(updates).eq('statecode_id', modalTarget.statecode_id);
      if (error) showError('Failed to update');
      else {
        setStatecodes((p) => p.map((x) => x.statecode_id === modalTarget.statecode_id ? { ...x, ...updates } : x));
        showSuccess('Status value updated'); closeModal();
      }
      setSaving(false);
    }
  };

  const handleDelete = async (sc: StatecodeDef) => {
    if (sc.is_system) return;
    await supabase.from('status_reason_definition').delete().eq('statecode_id', sc.statecode_id);
    await supabase.from('statecode_definition').delete().eq('statecode_id', sc.statecode_id);
    setStatecodes((p) => p.filter((x) => x.statecode_id !== sc.statecode_id));
    showSuccess('Status value deleted');
  };

  const handleMove = async (sc: StatecodeDef, dir: 'up' | 'down') => {
    const idx = sortedStatecodes.findIndex((x) => x.statecode_id === sc.statecode_id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedStatecodes.length) return;
    const a = sortedStatecodes[idx]; const b = sortedStatecodes[swapIdx];
    await Promise.all([
      supabase.from('statecode_definition').update({ sort_order: b.sort_order }).eq('statecode_id', a.statecode_id),
      supabase.from('statecode_definition').update({ sort_order: a.sort_order }).eq('statecode_id', b.statecode_id),
    ]);
    setStatecodes((p) => p.map((x) => {
      if (x.statecode_id === a.statecode_id) return { ...x, sort_order: b.sort_order };
      if (x.statecode_id === b.statecode_id) return { ...x, sort_order: a.sort_order };
      return x;
    }));
  };

  const modalValid = mName.trim().length > 0 && !isNaN(parseInt(mVal, 10));

  return (
    <div className="space-y-3">
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_72px_64px_36px] gap-3 items-center px-4 py-2 bg-slate-50 border-b border-slate-200">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Name</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Value</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">System</span>
          <span />
        </div>

        {sortedStatecodes.length === 0 && (
          <p className="text-[12px] text-slate-400 italic px-4 py-4 text-center">No status values defined yet.</p>
        )}

        {sortedStatecodes.map((sc, idx) => (
          <div key={sc.statecode_id} className="grid grid-cols-[1fr_72px_64px_36px] gap-3 items-center px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sc.is_active_state ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="text-[13px] font-medium text-slate-800 truncate">{sc.display_label}</span>
            </div>
            <span className="text-[13px] text-slate-500 font-mono tabular-nums">{sc.state_value}</span>
            <div className="flex justify-center">
              {sc.is_system ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                  <Shield size={9} /> System
                </span>
              ) : (
                <span className="text-[10px] text-slate-300">Custom</span>
              )}
            </div>
            <RowActionMenu actions={[
              { label: 'Rename', icon: <Pencil size={13} />, onClick: () => openEdit(sc) },
              { label: 'Move up', icon: <ArrowUp size={13} />, onClick: () => handleMove(sc, 'up'), disabled: idx === 0 },
              { label: 'Move down', icon: <ArrowDown size={13} />, onClick: () => handleMove(sc, 'down'), disabled: idx === sortedStatecodes.length - 1 },
              { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => handleDelete(sc), danger: true, disabled: sc.is_system },
            ]} />
          </div>
        ))}
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={openAdd}
        className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
      >
        <Plus size={14} /> Add status value
      </button>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        <Shield size={9} className="inline mr-0.5" />
        System values cannot be deleted or have their numeric value changed. Custom values can be fully managed.
      </p>

      {/* Add/Edit modal */}
      {modal && (
        <ValueModal
          title={modal === 'add' ? 'Add status value' : 'Edit status value'}
          onClose={closeModal}
          onSave={handleSaveModal}
          saving={saving}
          valid={modalValid}
        >
          <ModalField label="Display name" required>
            <input
              autoFocus
              type="text"
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && modalValid) handleSaveModal(); }}
              placeholder="e.g. In Progress"
              className={modalInput}
            />
          </ModalField>
          <ModalField label="Numeric value" required hint={modalTarget?.is_system ? 'System values cannot have their numeric value changed.' : 'Unique integer identifier for this status value.'}>
            <input
              type="number"
              value={mVal}
              onChange={(e) => setMVal(e.target.value)}
              disabled={!!modalTarget?.is_system}
              placeholder="e.g. 3"
              className={modalTarget?.is_system ? modalInputDisabled : modalInput}
            />
          </ModalField>
          {(!modalTarget?.is_system) && (
            <ModalField label="State type" hint="Determines whether records with this status are considered active or inactive.">
              <div className="flex gap-2">
                {[
                  { val: true, label: 'Active state', desc: 'Records are open/active' },
                  { val: false, label: 'Inactive state', desc: 'Records are closed/inactive' },
                ].map((opt) => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => setMActive(opt.val)}
                    className={`flex-1 flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      mActive === opt.val
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`text-[12px] font-medium ${mActive === opt.val ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</span>
                    <span className="text-[11px] text-slate-500">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </ModalField>
          )}
        </ValueModal>
      )}
    </div>
  );
}

// ── StatusReason manager ─────────────────────────────────────────────────────

function StatusReasonManager({ entityId }: { entityId: string }) {
  const { showError, showSuccess } = useToast();
  const { sortedStatecodes, reasons, setReasons } = useStatusData(entityId);
  const [saving, setSaving] = useState(false);
  const [selectedScId, setSelectedScId] = useState<string>('');

  useEffect(() => {
    if (sortedStatecodes.length > 0 && !selectedScId) {
      setSelectedScId(sortedStatecodes[0].statecode_id);
    }
  }, [sortedStatecodes, selectedScId]);

  // Modal state
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [modalTarget, setModalTarget] = useState<StatusReasonDef | null>(null);
  const [mName, setMName] = useState('');
  const [mVal, setMVal] = useState('');
  const [mColor, setMColor] = useState('#3B82F6');

  const scReasons = reasons.filter((r) => r.statecode_id === selectedScId).sort((a, b) => a.sort_order - b.sort_order);

  const openAdd = () => {
    setModal('add');
    setModalTarget(null);
    setMName('');
    setMVal(String((reasons.reduce((m, r) => Math.max(m, r.reason_value), 0) + 1)));
    setMColor('#3B82F6');
  };

  const openEdit = (r: StatusReasonDef) => {
    setModal('edit');
    setModalTarget(r);
    setMName(r.display_label);
    setMVal(String(r.reason_value));
    setMColor(r.color);
  };

  const closeModal = () => { setModal(null); setModalTarget(null); };

  const handleSaveModal = async () => {
    const trimName = mName.trim();
    const valNum = parseInt(mVal, 10);
    if (!trimName || isNaN(valNum) || !selectedScId) return;

    if (modal === 'add') {
      if (reasons.some((r) => r.reason_value === valNum)) { showError('Value already exists'); return; }
      setSaving(true);
      const maxSort = scReasons.reduce((m, r) => Math.max(m, r.sort_order), 0);
      const { data, error } = await supabase.from('status_reason_definition').insert({
        statecode_id: selectedScId, entity_definition_id: entityId,
        reason_value: valNum, display_label: trimName,
        color: mColor, sort_order: maxSort + 10,
        is_default: false, is_active: true, is_system: false, description: '',
      }).select().single();
      if (error) showError('Failed to add reason');
      else { setReasons((p) => [...p, data as StatusReasonDef]); showSuccess('Status reason added'); closeModal(); }
      setSaving(false);
    } else if (modal === 'edit' && modalTarget) {
      if (reasons.some((r) => r.reason_value === valNum && r.status_reason_id !== modalTarget.status_reason_id)) {
        showError('Value already exists'); return;
      }
      setSaving(true);
      const updates: Record<string, unknown> = { display_label: trimName, color: mColor };
      if (!modalTarget.is_system) updates.reason_value = valNum;
      const { error } = await supabase.from('status_reason_definition').update(updates).eq('status_reason_id', modalTarget.status_reason_id);
      if (error) showError('Failed to update');
      else {
        setReasons((p) => p.map((x) => x.status_reason_id === modalTarget.status_reason_id
          ? { ...x, display_label: trimName, color: mColor, ...(modalTarget.is_system ? {} : { reason_value: valNum }) }
          : x
        ));
        showSuccess('Status reason updated'); closeModal();
      }
      setSaving(false);
    }
  };

  const handleDelete = async (r: StatusReasonDef) => {
    if (r.is_system) return;
    await supabase.from('status_reason_definition').delete().eq('status_reason_id', r.status_reason_id);
    setReasons((p) => p.filter((x) => x.status_reason_id !== r.status_reason_id));
    showSuccess('Status reason deleted');
  };

  const handleMove = async (r: StatusReasonDef, dir: 'up' | 'down') => {
    const idx = scReasons.findIndex((x) => x.status_reason_id === r.status_reason_id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= scReasons.length) return;
    const a = scReasons[idx]; const b = scReasons[swapIdx];
    await Promise.all([
      supabase.from('status_reason_definition').update({ sort_order: b.sort_order }).eq('status_reason_id', a.status_reason_id),
      supabase.from('status_reason_definition').update({ sort_order: a.sort_order }).eq('status_reason_id', b.status_reason_id),
    ]);
    setReasons((p) => p.map((x) => {
      if (x.status_reason_id === a.status_reason_id) return { ...x, sort_order: b.sort_order };
      if (x.status_reason_id === b.status_reason_id) return { ...x, sort_order: a.sort_order };
      return x;
    }));
  };

  const handleSetDefault = async (r: StatusReasonDef) => {
    await supabase.from('status_reason_definition').update({ is_default: false }).eq('statecode_id', r.statecode_id);
    await supabase.from('status_reason_definition').update({ is_default: true }).eq('status_reason_id', r.status_reason_id);
    setReasons((p) => p.map((x) => ({ ...x, is_default: x.statecode_id === r.statecode_id ? x.status_reason_id === r.status_reason_id : x.is_default })));
    showSuccess('Default reason updated');
  };

  if (sortedStatecodes.length === 0) {
    return (
      <div className="text-[12px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
        No statecodes found. Add statecodes first via the statecode field.
      </div>
    );
  }

  const modalValid = mName.trim().length > 0 && !isNaN(parseInt(mVal, 10));

  return (
    <div className="space-y-3">
      {/* Statecode picker tabs */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Parent status</p>
        <div className="flex gap-1.5 border-b border-slate-200 pb-0">
          {sortedStatecodes.map((sc) => {
            const active = selectedScId === sc.statecode_id;
            const count = reasons.filter((r) => r.statecode_id === sc.statecode_id).length;
            return (
              <button
                key={sc.statecode_id}
                type="button"
                onClick={() => setSelectedScId(sc.statecode_id)}
                className={`flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-[1px] ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${sc.is_active_state ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {sc.display_label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reasons table */}
      {selectedScId && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[28px_1fr_72px_64px_36px] gap-3 items-center px-4 py-2 bg-slate-50 border-b border-slate-200">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Color</span>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Name</span>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Value</span>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">System</span>
            <span />
          </div>

          {scReasons.length === 0 && (
            <p className="text-[12px] text-slate-400 italic px-4 py-4 text-center">No status reasons defined for this status. Add one below.</p>
          )}

          {scReasons.map((r, idx) => (
            <div key={r.status_reason_id} className="grid grid-cols-[28px_1fr_72px_64px_36px] gap-3 items-center px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
              <span className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/5" style={{ backgroundColor: r.color }} />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-medium text-slate-800 truncate">{r.display_label}</span>
                {r.is_default && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">
                    <Star size={8} className="fill-emerald-500" /> Default
                  </span>
                )}
              </div>
              <span className="text-[13px] text-slate-500 font-mono tabular-nums">{r.reason_value}</span>
              <div className="flex justify-center">
                {r.is_system ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    <Shield size={9} /> System
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-300">Custom</span>
                )}
              </div>
              <RowActionMenu actions={[
                { label: 'Edit', icon: <Pencil size={13} />, onClick: () => openEdit(r) },
                { label: 'Set as default', icon: <Star size={13} />, onClick: () => handleSetDefault(r), disabled: r.is_default },
                { label: 'Move up', icon: <ArrowUp size={13} />, onClick: () => handleMove(r, 'up'), disabled: idx === 0 },
                { label: 'Move down', icon: <ArrowDown size={13} />, onClick: () => handleMove(r, 'down'), disabled: idx === scReasons.length - 1 },
                { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => handleDelete(r), danger: true, disabled: r.is_system },
              ]} />
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {selectedScId && (
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus size={14} /> Add status reason
        </button>
      )}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        <Shield size={9} className="inline mr-0.5" />
        System reasons cannot be deleted or have their numeric value changed. You can rename them and change their color.
      </p>

      {/* Add/Edit modal */}
      {modal && (
        <ValueModal
          title={modal === 'add' ? 'Add status reason' : 'Edit status reason'}
          onClose={closeModal}
          onSave={handleSaveModal}
          saving={saving}
          valid={modalValid}
        >
          <ModalField label="Display name" required>
            <input
              autoFocus
              type="text"
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && modalValid) handleSaveModal(); }}
              placeholder="e.g. Qualified"
              className={modalInput}
            />
          </ModalField>
          <ModalField label="Numeric value" required hint={modalTarget?.is_system ? 'System values cannot have their numeric value changed.' : 'Unique integer identifier for this reason.'}>
            <input
              type="number"
              value={mVal}
              onChange={(e) => setMVal(e.target.value)}
              disabled={!!modalTarget?.is_system}
              placeholder="e.g. 5"
              className={modalTarget?.is_system ? modalInputDisabled : modalInput}
            />
          </ModalField>
          <ModalField label="Color">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMColor(c)}
                    className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
                      mColor === c ? 'border-slate-700 scale-110 shadow-sm' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <div className="relative">
                  <input
                    type="color"
                    value={mColor}
                    onChange={(e) => setMColor(e.target.value)}
                    className="absolute inset-0 w-7 h-7 opacity-0 cursor-pointer"
                  />
                  <div className="w-7 h-7 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors">
                    <Palette size={13} className="text-slate-400" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full ring-1 ring-black/5" style={{ backgroundColor: mColor }} />
                <span className="text-[12px] text-slate-500 font-mono">{mColor}</span>
              </div>
            </div>
          </ModalField>
        </ValueModal>
      )}
    </div>
  );
}

const INLINE_CHOICE_TYPES = new Set(['choice', 'multi_choice']);
const LOOKUP_TYPES = new Set(['lookup']);
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);
const NUMERIC_TYPES = new Set(['number', 'decimal', 'currency']);

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function buildInitialForm(entityId: string, field?: FieldDefinition, defaultTypeId?: string): FieldFormData {
  if (field) {
    return {
      entity_definition_id: field.entity_definition_id, field_type_id: field.field_type_id,
      lookup_entity_id: field.lookup_entity_id,
      logical_name: field.logical_name, display_name: field.display_name,
      physical_column_name: field.physical_column_name, description: field.description,
      placeholder: field.placeholder, default_value: field.default_value,
      max_length: field.max_length, min_value: field.min_value, max_value: field.max_value,
      is_required: field.is_required, is_searchable: field.is_searchable,
      is_sortable: field.is_sortable, is_filterable: field.is_filterable,
      is_active: field.is_active, is_secured: field.is_secured, sort_order: field.sort_order,
      validation_rules: field.validation_rules,
      inline_choices: (field.config_json as { choices?: ChoiceOption[] } | null)?.choices ?? [],
      config_json: field.config_json,
    };
  }
  return {
    entity_definition_id: entityId, field_type_id: defaultTypeId ?? '',
    lookup_entity_id: null, logical_name: '', display_name: '',
    physical_column_name: '', description: null, placeholder: null, default_value: null,
    max_length: null, min_value: null, max_value: null,
    is_required: false, is_searchable: true, is_sortable: true, is_filterable: true,
    is_active: true, is_secured: false, sort_order: 0, validation_rules: null, inline_choices: [],
    config_json: null,
  };
}

interface FieldEditorPanelProps {
  entityId: string;
  field?: FieldDefinition;
  fieldTypes: FieldType[];
  entities: EntityDefinition[];
  onSave: (form: FieldFormData, choices: ChoiceOption[]) => Promise<void>;
  onClose: () => void;
}

export default function FieldEditorPanel({ entityId, field, fieldTypes, entities, onSave, onClose }: FieldEditorPanelProps) {
  const { showSuccess, showError } = useToast();
  const isEdit = !!field;
  const isSystemField = field?.is_system === true;
  const schemaLocked = isSystemField || (isEdit && field?.is_schema_editable === false);
  const defaultTypeId = fieldTypes.find((t) => t.name === 'text')?.field_type_id ?? '';
  const [form, setForm] = useState<FieldFormData>(buildInitialForm(entityId, field, defaultTypeId));
  const [autoSlug, setAutoSlug] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedType = fieldTypes.find((t) => t.field_type_id === form.field_type_id);
  const typeName = selectedType?.name ?? '';

  const initialCalc = (field?.config_json as { calculation?: CalculationConfig } | null)?.calculation ?? null;
  const initialLegacyFormula = (field?.config_json as { formula?: CalcFormula } | null)?.formula ?? null;
  const [calcConfig, setCalcConfig] = useState<CalculationConfig | null>(initialCalc);
  const [showCalcBuilder, setShowCalcBuilder] = useState(false);

  useEffect(() => {
    if (!isEdit && form.field_type_id === '') setForm((f) => ({ ...f, field_type_id: defaultTypeId }));
  }, [defaultTypeId, isEdit, form.field_type_id]);

  const set = <K extends keyof FieldFormData>(key: K, value: FieldFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const handleDisplayNameChange = (val: string) => {
    set('display_name', val);
    if (autoSlug) { const slug = toSlug(val); set('logical_name', slug); set('physical_column_name', slug); }
  };

  const handleTypeChange = (typeId: string) => {
    set('field_type_id', typeId);
    set('inline_choices', []);
    set('lookup_entity_id', null);
    const newTypeName = fieldTypes.find(t => t.field_type_id === typeId)?.name ?? '';
    if (newTypeName !== 'calculated') {
      set('config_json', null);
      setCalcConfig(null);
    }
  };

  const handleCalcSave = (c: CalculationConfig) => {
    setCalcConfig(c);
    set('config_json', { calculation: c });
    setShowCalcBuilder(false);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.display_name.trim()) errors.display_name = 'Required';
    if (!form.logical_name.trim()) errors.logical_name = 'Required';
    else if (!/^[a-z][a-z0-9_]*$/.test(form.logical_name)) errors.logical_name = 'Lowercase, start with letter';
    if (!form.physical_column_name.trim()) errors.physical_column_name = 'Required';
    if (!form.field_type_id) errors.field_type_id = 'Required';
    if (LOOKUP_TYPES.has(typeName) && !form.lookup_entity_id) errors.lookup_entity_id = 'Select target entity';
    if (INLINE_CHOICE_TYPES.has(typeName) && form.inline_choices.length === 0 && !isSystemField) errors.inline_choices = 'At least one option required';
    if (INLINE_CHOICE_TYPES.has(typeName) && form.inline_choices.some((c) => !c.value.trim() || !c.label.trim())) errors.inline_choices = 'All options must have a value and label';
    if (INLINE_CHOICE_TYPES.has(typeName)) {
      const vals = form.inline_choices.map((c) => c.value.trim()).filter(Boolean);
      if (vals.length !== new Set(vals).size) errors.inline_choices = 'Option values must be unique';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try { await onSave(form, form.inline_choices); }
    catch (e: unknown) { showError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const setValidation = (key: string, value: string | number | undefined) => {
    const current = form.validation_rules ?? {};
    set('validation_rules', value !== '' && value !== undefined
      ? { ...current, [key]: value }
      : Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
  };

  return (
    <>
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-xl bg-white shadow-2xl flex flex-col border-l border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-slate-800">{isEdit ? `Edit Field` : 'New Field'}</p>
              {isSystemField && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 border-slate-300 text-slate-600">
                  <Shield size={9} /> System
                </span>
              )}
            </div>
            {isEdit && <p className="text-[11px] text-slate-400 font-mono mt-0.5">{field!.logical_name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors">
            <X size={14} />
          </button>
        </div>
        {isSystemField && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-start gap-2 shrink-0">
            <Shield size={12} className="text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-600 leading-relaxed">
              This is a <strong>system field</strong>. The data type, logical name, and physical column are locked.
              You can update the display label, description, and behavior settings.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto">
          <div className="divide-y divide-slate-100">

            {/* ── Status field — read-only fixed values ── */}
            {isSystemField && field?.logical_name === 'status' && (
              <PanelSection title="Status Values">
                <StatusFieldPanel />
              </PanelSection>
            )}

            {/* ── Statecode field — manage statecodes (value + name) ── */}
            {isSystemField && field?.logical_name === 'statecode' && (
              <PanelSection title="Statecode Values">
                <StatecodeManager entityId={entityId} />
              </PanelSection>
            )}

            {/* ── statusreason field — pick statecode, manage reasons ── */}
            {isSystemField && field?.logical_name === 'statusreason' && (
              <PanelSection title="Status Reasons">
                <StatusReasonManager entityId={entityId} />
              </PanelSection>
            )}

            <PanelSection title="Identity">
              <div className="grid grid-cols-2 gap-3">
                <F label="Display Name" required error={fieldErrors.display_name}>
                  <input type="text" value={form.display_name} onChange={(e) => handleDisplayNameChange(e.target.value)}
                    placeholder="e.g. Company Name" className={ic(!!fieldErrors.display_name)} autoFocus={!isEdit} />
                </F>
                <F label="Logical Name" required error={fieldErrors.logical_name}>
                  <input type="text" value={form.logical_name} onChange={(e) => { setAutoSlug(false); set('logical_name', e.target.value); }}
                    placeholder="e.g. company_name" disabled={schemaLocked} className={ic(!!fieldErrors.logical_name, schemaLocked)} />
                </F>
              </div>
              <F label="Physical Column" required error={fieldErrors.physical_column_name}>
                <input type="text" value={form.physical_column_name} onChange={(e) => { setAutoSlug(false); set('physical_column_name', e.target.value); }}
                  placeholder="e.g. company_name" disabled={schemaLocked} className={ic(!!fieldErrors.physical_column_name, schemaLocked)} />
              </F>
              <F label="Description">
                <textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)}
                  rows={2} placeholder="Optional..." className={`${ic(false)} resize-none`} />
              </F>
            </PanelSection>

            <PanelSection title="Data Type">
              <F label="Type" required error={fieldErrors.field_type_id}>
                <div className={`grid grid-cols-4 gap-1.5 ${schemaLocked ? 'pointer-events-none opacity-60' : ''}`}>
                  {fieldTypes.map((ft) => {
                    const sel = form.field_type_id === ft.field_type_id;
                    return (
                      <button key={ft.field_type_id} type="button" onClick={() => !schemaLocked && handleTypeChange(ft.field_type_id)}
                        className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-all text-center ${sel ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                        {ft.display_name}
                      </button>
                    );
                  })}
                </div>
              </F>

              {LOOKUP_TYPES.has(typeName) && (
                <F label="Target Entity" required error={fieldErrors.lookup_entity_id}>
                  <SearchableSelect
                    options={entities.map((e) => ({ value: e.entity_definition_id, label: e.display_name }))}
                    value={form.lookup_entity_id ?? ''}
                    onChange={(v) => set('lookup_entity_id', v || null)}
                    placeholder="Select entity..."
                    className={fieldErrors.lookup_entity_id ? 'ring-2 ring-red-400 rounded-lg' : ''}
                  />
                </F>
              )}

              {typeName === 'calculated' && (
                <F label="Calculation">
                  {calcConfig || initialLegacyFormula ? (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-[#f0f4ff] border border-[#c7d9ff] rounded-lg">
                      <Calculator size={13} className="text-[#3b6fff] shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[#1e3a8a] font-medium flex-1 leading-relaxed">
                        {calcConfig
                          ? summarizeCalculation(calcConfig)
                          : 'Legacy formula — open the designer to review and upgrade.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCalcBuilder(true)}
                        className="text-[11px] text-[#3b6fff] hover:text-[#1d4ed8] font-semibold shrink-0 transition"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCalcBuilder(true)}
                      className="flex items-center justify-center gap-2 w-full px-3 py-3 border-2 border-dashed border-[#c7d9ff] rounded-lg text-[#3b6fff] hover:border-[#3b6fff] hover:bg-[#f0f4ff] transition text-[12px] font-semibold"
                    >
                      <Calculator size={14} />
                      Configure Calculation
                    </button>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    Calculated columns are read-only and recalculated automatically whenever a referenced field changes.
                  </p>
                </F>
              )}

              {INLINE_CHOICE_TYPES.has(typeName) && (
                <F label="Choice Options" required={!isSystemField} error={fieldErrors.inline_choices}>
                  <div className="space-y-1.5">
                    {form.inline_choices.length === 0 && (
                      <p className="text-[11px] text-slate-400 italic px-1">No options yet. Add one below.</p>
                    )}
                    {form.inline_choices.map((choice, idx) => {
                      const isDupeValue = choice.value.trim() !== '' &&
                        form.inline_choices.some((c, i) => i !== idx && c.value.trim() === choice.value.trim());
                      return (
                      <div key={idx} className="flex items-center gap-1.5 group">
                        <GripVertical size={12} className="text-slate-300 shrink-0 cursor-grab" />
                        <div className="flex-1 relative">
                        <input
                          type="text"
                          value={choice.value}
                          onChange={(e) => {
                            const next = [...form.inline_choices];
                            next[idx] = { ...next[idx], value: e.target.value };
                            set('inline_choices', next);
                          }}
                          placeholder="Value (stored)"
                          className={`w-full px-2 py-1.5 text-[11px] border rounded focus:outline-none bg-white ${isDupeValue ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-slate-300 focus:border-blue-400'}`}
                        />
                        {isDupeValue && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-red-500 font-medium">duplicate</span>}
                        </div>
                        <input
                          type="text"
                          value={choice.label}
                          onChange={(e) => {
                            const next = [...form.inline_choices];
                            next[idx] = { ...next[idx], label: e.target.value };
                            set('inline_choices', next);
                          }}
                          placeholder="Label (displayed)"
                          className="flex-1 px-2 py-1.5 text-[11px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => set('inline_choices', form.inline_choices.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Remove option"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => set('inline_choices', [...form.inline_choices, { value: '', label: '', sort_order: form.inline_choices.length }])}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors mt-1"
                    >
                      <Plus size={11} /> Add option
                    </button>
                  </div>
                </F>
              )}
            </PanelSection>

            <PanelSection title="Constraints">
              <div className="grid grid-cols-2 gap-3">
                <F label="Placeholder"><input type="text" value={form.placeholder ?? ''} onChange={(e) => set('placeholder', e.target.value || null)} placeholder="Enter a value..." className={ic(false)} /></F>
                <F label="Default Value"><input type="text" value={form.default_value ?? ''} onChange={(e) => set('default_value', e.target.value || null)} placeholder="Default" className={ic(false)} /></F>
              </div>
              {TEXT_TYPES.has(typeName) && (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Min Length"><input type="number" value={form.validation_rules?.min_length ?? ''} onChange={(e) => setValidation('min_length', e.target.value ? Number(e.target.value) : undefined)} placeholder="0" min={0} className={ic(false)} /></F>
                  <F label="Max Length"><input type="number" value={form.max_length ?? ''} onChange={(e) => set('max_length', e.target.value ? Number(e.target.value) : null)} placeholder="255" min={1} className={ic(false)} /></F>
                </div>
              )}
              {NUMERIC_TYPES.has(typeName) && (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Min Value"><input type="number" value={form.min_value ?? ''} onChange={(e) => set('min_value', e.target.value ? Number(e.target.value) : null)} placeholder="No min" className={ic(false)} /></F>
                  <F label="Max Value"><input type="number" value={form.max_value ?? ''} onChange={(e) => set('max_value', e.target.value ? Number(e.target.value) : null)} placeholder="No max" className={ic(false)} /></F>
                </div>
              )}
              <F label="Regex Pattern"><input type="text" value={form.validation_rules?.regex_pattern ?? ''} onChange={(e) => setValidation('regex_pattern', e.target.value || undefined)} placeholder="e.g. ^[A-Z]{2}\\d{6}$" className={ic(false)} /></F>
            </PanelSection>

            <PanelSection title="Behavior">
              <div className="space-y-1.5">
                {[
                  { key: 'is_required' as const, label: 'Required', desc: 'Must have a value before saving' },
                  { key: 'is_searchable' as const, label: 'Searchable', desc: 'Include in global search' },
                  { key: 'is_sortable' as const, label: 'Sortable', desc: 'Allow sorting in views' },
                  { key: 'is_filterable' as const, label: 'Filterable', desc: 'Allow filtering by this field' },
                  { key: 'is_active' as const, label: 'Active', desc: 'Visible and usable' },
                  { key: 'is_secured' as const, label: 'Enable Field Security', desc: 'Restrict access via column security profiles' },
                ].map((f) => (
                  <ToggleRow key={f.key} label={f.label} desc={f.desc} checked={form[f.key] as boolean} onChange={(v) => set(f.key, v)} />
                ))}
              </div>
            </PanelSection>

            <PanelSection title="Display Order">
              <F label="Sort Order" hint="Lower numbers appear first">
                <input type="number" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} min={0} className={`${ic(false)} w-28`} />
              </F>
            </PanelSection>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[12px] font-medium rounded transition-colors">
            <Save size={13} /> {saving ? 'Saving...' : isSystemField ? 'Save Label & Settings' : isEdit ? 'Save Changes' : 'Add Field'}
          </button>
        </div>
      </div>
    </div>

    {showCalcBuilder && (
      <CalcBuilderModal
        entityId={entityId}
        currentFieldLogicalName={field?.logical_name}
        calculation={calcConfig}
        legacyFormula={initialLegacyFormula}
        fieldDisplayName={form.display_name}
        onSave={handleCalcSave}
        onClose={() => setShowCalcBuilder(false)}
      />
    )}
    </>
  );
}

function ic(hasError: boolean, disabled?: boolean) {
  return ['w-full px-2.5 py-2 text-[12px] border rounded transition-colors focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400',
    hasError ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white text-slate-800',
    disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : '',
  ].filter(Boolean).join(' ');
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function F({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error
        ? <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={10} />{error}</p>
        : hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null
      }
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)}
      className={`flex items-center justify-between px-3 py-2 rounded border cursor-pointer transition-colors ${checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <div>
        <p className="text-[12px] font-medium text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500">{desc}</p>
      </div>
      <div className={`relative rounded-full transition-colors shrink-0 ml-4 ${checked ? 'bg-blue-500' : 'bg-slate-200'}`} style={{ height: '18px', width: '32px' }}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </div>
  );
}
