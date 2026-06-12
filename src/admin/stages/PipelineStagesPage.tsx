import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Filter, GitMerge, X,
  ChevronUp, ChevronDown, AlertTriangle,
} from 'lucide-react';
import type { ProcessStage, ProcessFlow, StageType, StageCategory } from '../../types/processFlow';
import { STAGE_TYPE_META, STAGE_CATEGORIES } from '../../types/processFlow';
import { fetchProcessFlows, fetchProcessFlowWithDetails } from '../../services/processFlowService';
import StageDetailPanel from './StageDetailPanel';

type SortField = 'name' | 'stage_type' | 'stage_category' | 'display_order' | 'probability';
type SortDir   = 'asc' | 'desc';

interface StageRow extends ProcessStage {
  flowName: string;
  flowId: string;
}

export default function PipelineStagesPage() {
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [stageRows, setStageRows] = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterFlow, setFilterFlow] = useState('');
  const [filterType, setFilterType] = useState<StageType | ''>('');
  const [filterCategory, setFilterCategory] = useState<StageCategory | ''>('');
  const [filterActive, setFilterActive] = useState<'' | 'active' | 'terminal'>('');

  const [sortField, setSortField] = useState<SortField>('display_order');
  const [sortDir, setSortDir]     = useState<SortDir>('asc');

  const [selectedStage, setSelectedStage] = useState<StageRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const flowList = await fetchProcessFlows();
      setFlows(flowList);

      const detailResults = await Promise.all(
        flowList.map((f) => fetchProcessFlowWithDetails(f.process_flow_id))
      );

      const rows: StageRow[] = [];
      for (const flow of detailResults) {
        for (const stage of flow.stages ?? []) {
          rows.push({ ...stage, flowName: flow.name, flowId: flow.process_flow_id });
        }
      }
      setStageRows(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStageUpdated = (updated: ProcessStage) => {
    setStageRows((prev) =>
      prev.map((r) => r.process_stage_id === updated.process_stage_id
        ? { ...updated, flowName: r.flowName, flowId: r.flowId }
        : r
      )
    );
    if (selectedStage?.process_stage_id === updated.process_stage_id) {
      setSelectedStage((prev) => prev ? { ...updated, flowName: prev.flowName, flowId: prev.flowId } : null);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filtered = stageRows
    .filter((s) => {
      const q = search.toLowerCase();
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.stage_key.toLowerCase().includes(q) || s.flowName.toLowerCase().includes(q);
      const matchFlow = !filterFlow || s.flowId === filterFlow;
      const matchType = !filterType || s.stage_type === filterType;
      const matchCat  = !filterCategory || s.stage_category === filterCategory;
      const matchActive = !filterActive
        || (filterActive === 'active' && !s.is_terminal)
        || (filterActive === 'terminal' && s.is_terminal);
      return matchSearch && matchFlow && matchType && matchCat && matchActive;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name')          cmp = a.name.localeCompare(b.name);
      if (sortField === 'stage_type')    cmp = a.stage_type.localeCompare(b.stage_type);
      if (sortField === 'stage_category')cmp = a.stage_category.localeCompare(b.stage_category);
      if (sortField === 'display_order') cmp = a.display_order - b.display_order;
      if (sortField === 'probability')   cmp = (a.probability ?? -1) - (b.probability ?? -1);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDown size={11} className="inline ml-0.5" />;
  };

  const th = (label: string, field: SortField) => (
    <th
      onClick={() => handleSort(field)}
      className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
    >
      {label}<SortIcon field={field} />
    </th>
  );

  return (
    <div className="flex h-full">
      {/* Main list area */}
      <div className={`flex flex-col ${selectedStage ? 'w-[58%]' : 'flex-1'} border-r border-gray-200 transition-all`}>
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-200 bg-white space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stages..."
                  className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="text-xs text-gray-400 font-medium">
              {filtered.length} stage{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={12} className="text-gray-400 flex-shrink-0" />
            <FilterSelect
              value={filterFlow}
              onChange={(e) => setFilterFlow(e.target.value)}
              className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">All Flows</option>
              {flows.map((f) => <option key={f.process_flow_id} value={f.process_flow_id}>{f.name}</option>)}
            </FilterSelect>
            <FilterSelect
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as StageType | '')}
              className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">All Types</option>
              {(Object.keys(STAGE_TYPE_META) as StageType[]).map((t) => (
                <option key={t} value={t}>{STAGE_TYPE_META[t].label}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as StageCategory | '')}
              className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">All Categories</option>
              {STAGE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </FilterSelect>
            <FilterSelect
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="py-1 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            >
              <option value="">Active + Terminal</option>
              <option value="active">Active only</option>
              <option value="terminal">Terminal only</option>
            </FilterSelect>
            {(filterFlow || filterType || filterCategory || filterActive || search) && (
              <button
                onClick={() => { setFilterFlow(''); setFilterType(''); setFilterCategory(''); setFilterActive(''); setSearch(''); }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={11} />Clear
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />{error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                {th('Stage Name', 'name')}
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Flow</th>
                {th('Category', 'stage_category')}
                {th('Type', 'stage_type')}
                {th('Order', 'display_order')}
                {th('Probability', 'probability')}
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">Gates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="py-14 text-center text-xs text-gray-400">Loading stages...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center text-xs text-gray-400">No stages found</td></tr>
              ) : (
                filtered.map((stage) => (
                  <StageRow
                    key={stage.process_stage_id}
                    stage={stage}
                    isSelected={selectedStage?.process_stage_id === stage.process_stage_id}
                    onSelect={() => setSelectedStage((prev) =>
                      prev?.process_stage_id === stage.process_stage_id ? null : stage
                    )}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selectedStage ? (
        <div className="flex-1 overflow-auto bg-white">
          <StageDetailPanel
            stage={selectedStage}
            flowName={selectedStage.flowName}
            onUpdated={handleStageUpdated}
            onClose={() => setSelectedStage(null)}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
          <div className="text-center">
            <GitMerge size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium text-gray-500">Select a stage to configure it</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage Row ────────────────────────────────────────────────────────────────

interface StageRowProps {
  stage: StageRow;
  isSelected: boolean;
  onSelect: () => void;
}

function StageRow({ stage, isSelected, onSelect }: StageRowProps) {
  const meta = STAGE_TYPE_META[stage.stage_type];
  const catLabel = STAGE_CATEGORIES.find((c) => c.id === stage.stage_category)?.label ?? stage.stage_category;

  const gateCount = [
    stage.requires_entry_approval,
    stage.requires_exit_approval,
    !stage.allow_backward_movement,
  ].filter(Boolean).length;

  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-50 border-l-2 border-l-blue-500'
          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.stage_color || meta.color }}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-800">{stage.name}</span>
              {stage.is_default && (
                <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0 leading-4">default</span>
              )}
            </div>
            <span className="text-[10px] text-gray-400 font-mono">{stage.stage_key}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <GitMerge size={11} className="text-gray-300 flex-shrink-0" />
          <span className="text-xs text-gray-500 truncate max-w-[120px]">{stage.flowName}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5">{catLabel}</span>
      </td>
      <td className="px-4 py-3">
        <span
          className="text-[11px] font-medium rounded-full px-2 py-0.5"
          style={{ backgroundColor: meta.color + '20', color: meta.color }}
        >
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">{stage.display_order}</td>
      <td className="px-4 py-3">
        {stage.probability !== null && !stage.is_terminal ? (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 w-14 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${stage.probability}%` }} />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{stage.probability}%</span>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {gateCount > 0 ? (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            {gateCount} gate{gateCount > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}
