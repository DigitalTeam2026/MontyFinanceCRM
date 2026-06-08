import { useEffect, useState } from 'react';
import { Plus, ExternalLink, Loader2, Inbox } from 'lucide-react';
import type { AppEntity } from '../../types';
import { fetchRelatedRecords } from '../../services/recordService';
import StatusBadge from '../StatusBadge';

interface SubgridColumn {
  key: string;
  label: string;
  type?: 'text' | 'badge' | 'date' | 'currency';
}

interface SubgridConfig {
  entity: AppEntity;
  title: string;
  foreignKey: string;
  columns: SubgridColumn[];
  allowCreate?: boolean;
}

const SUBGRID_CONFIGS: Partial<Record<AppEntity, SubgridConfig[]>> = {
  accounts: [
    {
      entity: 'contacts',
      title: 'Contacts',
      foreignKey: 'account_id',
      allowCreate: true,
      columns: [
        { key: 'first_name', label: 'Name', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'job_title', label: 'Job Title', type: 'text' },
      ],
    },
    {
      entity: 'opportunities',
      title: 'Opportunities',
      foreignKey: 'account_id',
      allowCreate: true,
      columns: [
        { key: 'topic', label: 'Name', type: 'text' },
        { key: 'stage', label: 'Stage', type: 'badge' },
        { key: 'estimated_value', label: 'Value', type: 'currency' },
        { key: 'estimated_close_date', label: 'Close Date', type: 'date' },
      ],
    },
  ],
  contacts: [
    {
      entity: 'opportunities',
      title: 'Opportunities',
      foreignKey: 'primary_contact_id',
      allowCreate: false,
      columns: [
        { key: 'topic', label: 'Name', type: 'text' },
        { key: 'stage', label: 'Stage', type: 'badge' },
      ],
    },
  ],
};

function formatDate(val: unknown): string {
  if (!val || typeof val !== 'string') return '—';
  return new Date(val).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(val: unknown, currencyCode?: string | null): string {
  if (val == null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode ?? 'USD', minimumFractionDigits: 0 }).format(num);
}

interface SubgridProps {
  parentEntity: AppEntity;
  recordId: string;
  onOpen?: (entity: AppEntity, id: string) => void;
}

function SingleSubgrid({
  config,
  recordId,
  onOpen,
}: {
  config: SubgridConfig;
  recordId: string;
  onOpen?: (entity: AppEntity, id: string) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchRelatedRecords(config.entity, config.foreignKey, recordId, 5)
      .then((data) => setRows(data as Record<string, unknown>[]))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [config.entity, config.foreignKey, recordId]);

  const renderCell = (row: Record<string, unknown>, col: SubgridColumn) => {
    const val = row[col.key];
    if (col.type === 'badge') return <StatusBadge value={String(val ?? '')} />;
    if (col.type === 'date') return <span className="text-slate-500 text-[11px]">{formatDate(val)}</span>;
    if (col.type === 'currency') return <span className="text-slate-700 text-[11px] font-medium">{formatCurrency(val, row.currency_code as string | null)}</span>;
    return <span className="text-slate-600 text-[12px]">{String(val ?? '—')}</span>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <h4 className="text-[12px] font-semibold text-slate-600">{config.title}</h4>
        <div className="flex items-center gap-1">
          {config.allowCreate && (
            <button className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 rounded transition">
              <Plus size={11} />
              New
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-400 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Inbox size={16} className="mb-1" />
          <p className="text-[11px]">No {config.title.toLowerCase()} found</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {config.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide"
                >
                  {col.label}
                </th>
              ))}
              <th className="w-6 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id as string}
                className="hover:bg-[#ebf1fa] transition-colors duration-100 cursor-pointer"
                onClick={() => onOpen?.(config.entity, row.id as string)}
              >
                {config.columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 border-b border-slate-50">
                    {renderCell(row, col)}
                  </td>
                ))}
                <td className="px-2 py-2 border-b border-slate-50 group">
                  <ExternalLink size={11} className="text-slate-200 group-hover:text-blue-400 transition-colors duration-100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function RecordSubgrid({ parentEntity, recordId, onOpen }: SubgridProps) {
  const configs = SUBGRID_CONFIGS[parentEntity] ?? [];
  if (configs.length === 0) return null;

  return (
    <div className="space-y-4">
      {configs.map((cfg) => (
        <SingleSubgrid key={cfg.entity} config={cfg} recordId={recordId} onOpen={onOpen} />
      ))}
    </div>
  );
}
