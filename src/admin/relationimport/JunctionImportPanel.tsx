import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2,
  Loader2, ArrowLeft, GitMerge, Copy,
} from 'lucide-react';
import FilterSelect from '../../app/components/FilterSelect';
import { supabase } from '../../lib/supabase';
import {
  listJunctionRelationships, resolveJunctionImportConfig,
  generateRelationTemplate, downloadWorkbook,
  parseRelationFile, validateAndResolveRelations, executeRelationImport,
} from '../../app/services/relationImportEngine';
import type {
  JunctionRelationshipOption, JunctionImportConfig,
  RelationPreviewRow, RelationImportResult,
} from '../../app/services/relationImportEngine';

type Step = 'select' | 'options' | 'uploading' | 'preview' | 'importing' | 'result';

const PREVIEW_PAGE_SIZE = 50;

export default function JunctionImportPanel() {
  const [relationships, setRelationships] = useState<JunctionRelationshipOption[]>([]);
  const [loadingRels, setLoadingRels] = useState(true);
  const [selectedRelId, setSelectedRelId] = useState('');
  const [config, setConfig] = useState<JunctionImportConfig | null>(null);

  const [step, setStep] = useState<Step>('select');
  const [preview, setPreview] = useState<RelationPreviewRow[]>([]);
  const [result, setResult] = useState<RelationImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    listJunctionRelationships()
      .then(setRelationships)
      .catch((e) => setError(e.message ?? 'Failed to load relationships'))
      .finally(() => setLoadingRels(false));
  }, []);

  const validCount = preview.filter((r) => r.isValid && !r.isDuplicate).length;
  const dupCount = preview.filter((r) => r.isValid && r.isDuplicate).length;
  const errorCount = preview.filter((r) => !r.isValid).length;

  const handleSelectRel = useCallback(async (relId: string) => {
    setSelectedRelId(relId);
    setConfig(null);
    setPreview([]);
    setResult(null);
    setError(null);
    if (!relId) { setStep('select'); return; }
    setLoading(true);
    try {
      const cfg = await resolveJunctionImportConfig(relId);
      setConfig(cfg);
      setStep('options');
    } catch (e: any) {
      setError(e.message ?? 'Failed to resolve relationship');
      setStep('select');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    if (!config) return;
    setError(null);
    try {
      const wb = generateRelationTemplate(config);
      downloadWorkbook(wb, `${config.displayName.replace(/\s+/g, '_')}_Relations_Template.xlsx`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate template');
    }
  }, [config]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config) return;
    setStep('uploading');
    setLoading(true);
    setError(null);
    try {
      const rows = await parseRelationFile(file);
      if (rows.length === 0) {
        setError('The uploaded file contains no data rows.');
        setStep('options');
        return;
      }
      const validated = await validateAndResolveRelations(rows, config);
      setPreview(validated);
      setPreviewPage(0);
      setStep('preview');
    } catch (err: any) {
      setError(err.message ?? 'Failed to process file');
      setStep('options');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [config]);

  const handleImport = useCallback(async () => {
    if (!config || !userId) {
      setError('No active user session.');
      return;
    }
    setStep('importing');
    setLoading(true);
    setError(null);
    try {
      const res = await executeRelationImport(config, preview, userId);
      setResult(res);
      setStep('result');
    } catch (err: any) {
      setError(err.message ?? 'Import failed');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }, [config, preview, userId]);

  const pagedPreview = preview.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE);
  const totalPreviewPages = Math.ceil(preview.length / PREVIEW_PAGE_SIZE);

  return (
    <div className="max-w-[1100px] mx-auto">
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-md bg-red-50 border border-red-200">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <span className="text-[12px] text-red-700">{error}</span>
        </div>
      )}

      {/* Relationship picker */}
      <div className="bg-white border rounded-lg p-4 mb-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <GitMerge size={15} className="text-orange-600" />
          <span className="text-[13px] font-semibold text-[var(--ink-800)]">Link table to import</span>
        </div>
        <p className="text-[12px] text-[var(--ink-500)] mb-3">
          For many-to-many relations only — a separate link table holding two record IDs.
          For a 1:N relation (one parent → many children, e.g. one Opportunity → many POS Locations),
          use the <strong>Records</strong> tab instead and import the child table.
        </p>
        {loadingRels ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-500)]">
            <Loader2 size={14} className="animate-spin" /> Loading relationships…
          </div>
        ) : relationships.length === 0 ? (
          <p className="text-[12px] text-amber-600">
            No junction (N:N) relationships found. Create one under Relationships first.
          </p>
        ) : (
          <FilterSelect
            value={selectedRelId}
            onChange={(e) => handleSelectRel(e.target.value)}
            className="w-full h-[34px] px-3 text-[12px] bg-white border rounded text-[var(--ink-700)]
              focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <option value="">Select a relationship…</option>
            {relationships.map((r) => (
              <option key={r.relationshipDefinitionId} value={r.relationshipDefinitionId}>
                {r.displayName} ({r.sourceEntityLabel} ↔ {r.targetEntityLabel})
              </option>
            ))}
          </FilterSelect>
        )}
      </div>

      {config && (
        <>
          {/* Mapping summary */}
          <div className="bg-white border rounded-lg p-4 mb-4 text-[12px]" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-2 gap-3">
              <SummaryItem label="Junction table" value={config.junctionTable} mono />
              <SummaryItem label="Source / Target" value={`${config.source.label} → ${config.target.label}`} />
              <SummaryItem
                label={`${config.source.label} match`}
                value={`name${config.source.hasLegacyId ? ' or legacy ID' : ''}`}
              />
              <SummaryItem
                label={`${config.target.label} match`}
                value={`name${config.target.hasLegacyId ? ' or legacy ID' : ''}`}
              />
            </div>
            {config.extraColumns.length > 0 && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[11px] font-semibold text-[var(--ink-600)] uppercase tracking-wide">
                  Extra columns
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {config.extraColumns.map((c) => (
                    <span key={c.column} className="px-2 py-0.5 rounded text-[11px] bg-[var(--ink-50)] text-[var(--ink-600)]">
                      {c.label}{c.isRequired ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Download + Upload */}
          {(step === 'options' || step === 'uploading') && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Download size={15} className="text-emerald-600" />
                  <span className="text-[13px] font-semibold text-[var(--ink-800)]">Download Template</span>
                </div>
                <p className="text-[12px] text-[var(--ink-500)] mb-3">
                  A pre-formatted Excel template with the source, target and extra columns.
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium rounded
                    bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  <Download size={13} /> Download Template
                </button>
              </div>

              <div className="bg-white border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Upload size={15} className="text-blue-600" />
                  <span className="text-[13px] font-semibold text-[var(--ink-800)]">Upload Filled File</span>
                </div>
                <p className="text-[12px] text-[var(--ink-500)] mb-3">
                  Upload the filled template to preview and import the links.
                </p>
                <label
                  className={`flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg transition-colors ${
                    loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {step === 'uploading'
                    ? <Loader2 size={16} className="animate-spin text-[var(--navy-accent)]" />
                    : <Upload size={16} className="text-[var(--ink-400)]" />}
                  <span className="text-[12px] text-[var(--ink-500)]">
                    {step === 'uploading' ? 'Processing…' : 'Choose .xlsx file'}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Preview */}
          {step === 'preview' && (
            <div className="bg-white border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button
                  onClick={() => { setStep('options'); setPreview([]); }}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] border rounded text-[var(--ink-600)] hover:bg-[var(--ink-50)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <ArrowLeft size={12} /> Back
                </button>
                <Stat label="Total" value={preview.length} className="bg-[var(--ink-50)] text-[var(--ink-600)]" />
                <Stat label="Will create" value={validCount} icon={<CheckCircle2 size={13} className="text-emerald-600" />} className="bg-emerald-50 text-emerald-700" />
                {dupCount > 0 && (
                  <Stat label="Already linked (skip)" value={dupCount} icon={<Copy size={13} className="text-amber-600" />} className="bg-amber-50 text-amber-700" />
                )}
                {errorCount > 0 && (
                  <Stat label="Errors" value={errorCount} icon={<AlertTriangle size={13} className="text-red-500" />} className="bg-red-50 text-red-700" />
                )}
              </div>

              <div className="border rounded-lg overflow-hidden mb-3" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: 'var(--ink-50)' }}>
                        <Th>#</Th>
                        <Th>Status</Th>
                        <Th>{config.source.label}</Th>
                        <Th>{config.target.label}</Th>
                        {config.extraColumns.map((c) => <Th key={c.column}>{c.label}</Th>)}
                        <Th>Errors</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPreview.map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={!row.isValid ? 'bg-red-50/50' : row.isDuplicate ? 'bg-amber-50/40' : 'hover:bg-[var(--ink-50)]'}
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          <td className="px-2 py-1.5 text-[var(--ink-400)]">{row.rowIndex}</td>
                          <td className="px-2 py-1.5">
                            {!row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle size={12} /> Error</span>
                            ) : row.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 text-amber-600"><Copy size={12} /> Exists</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> OK</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 max-w-[200px] truncate text-[var(--ink-700)]">{row.sourceKey || '—'}</td>
                          <td className="px-2 py-1.5 max-w-[200px] truncate text-[var(--ink-700)]">{row.targetKey || '—'}</td>
                          {config.extraColumns.map((c) => (
                            <td key={c.column} className="px-2 py-1.5 max-w-[160px] truncate text-[var(--ink-600)]">
                              {row.resolved[c.column] != null ? String(row.resolved[c.column]) : '—'}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-red-600 max-w-[260px]">
                            {row.errors.map((e, idx) => (
                              <div key={idx} className="text-[10px]"><span className="font-medium">{e.column}:</span> {e.message}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalPreviewPages > 1 && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <button onClick={() => setPreviewPage((p) => Math.max(0, p - 1))} disabled={previewPage === 0}
                    className="px-2 py-1 text-[11px] border rounded disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>Prev</button>
                  <span className="text-[11px] text-[var(--ink-500)]">Page {previewPage + 1} of {totalPreviewPages}</span>
                  <button onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))} disabled={previewPage >= totalPreviewPages - 1}
                    className="px-2 py-1 text-[11px] border rounded disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>Next</button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <span className="text-[11px] text-[var(--ink-400)] mr-auto">
                  {validCount} link{validCount !== 1 ? 's' : ''} will be created{dupCount > 0 ? `, ${dupCount} skipped` : ''}
                </span>
                <button
                  onClick={handleImport}
                  disabled={validCount === 0 || loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded
                    bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Import {validCount} Link{validCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="bg-white border rounded-lg flex flex-col items-center justify-center py-12" style={{ borderColor: 'var(--border)' }}>
              <Loader2 size={32} className="animate-spin text-[var(--navy-accent)] mb-3" />
              <p className="text-[13px] text-[var(--ink-600)]">Creating links…</p>
            </div>
          )}

          {step === 'result' && result && (
            <div className="bg-white border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 mb-3">
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-emerald-800">Import Complete</p>
                  <p className="text-[12px] text-emerald-700 mt-0.5">
                    {result.created} created
                    {result.skipped > 0 && `, ${result.skipped} skipped (already linked)`}
                    {result.failed > 0 && `, ${result.failed} failed`}
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <div className="px-3 py-2 text-[11px] font-semibold text-red-700 bg-red-50" style={{ borderBottom: '1px solid var(--border)' }}>
                    Failed Rows ({result.errors.length})
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="px-3 py-1.5 text-[11px] text-red-600" style={{ borderBottom: '1px solid var(--border)' }}>
                        Row {e.row}: {e.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => { setStep('options'); setPreview([]); setResult(null); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded
                    bg-[var(--navy-accent)] text-white hover:opacity-90 transition-colors"
                >
                  <FileSpreadsheet size={13} /> Import More
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-[11px] text-[var(--ink-400)] uppercase tracking-wide">{label}</span>
      <p className={`text-[12px] text-[var(--ink-800)] ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value, icon, className }: { label: string; value: number; icon?: React.ReactNode; className: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${className}`}>
      {icon}
      <span className="text-[11px] font-semibold">{label}: {value}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 py-2 text-left font-semibold text-[var(--ink-600)] sticky top-0 bg-[var(--ink-50)] z-10 whitespace-nowrap">
      {children}
    </th>
  );
}
