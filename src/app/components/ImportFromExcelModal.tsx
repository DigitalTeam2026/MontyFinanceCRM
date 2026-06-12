import FilterSelect from './FilterSelect';
import { useState, useCallback, useRef } from 'react';
import {
  X, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import type { AppEntity } from '../types';
import type { ColumnState } from './ColumnCustomizer';
import type {
  ImportColumnMeta, ImportPreviewRow, ImportMode, ImportResult,
} from '../services/importEngine';
import {
  resolveImportColumns, fetchReferenceData,
  generateTemplate, downloadWorkbook,
  parseExcelFile, validateAndResolve, executeImport,
} from '../services/importEngine';

interface ImportFromExcelModalProps {
  entity: AppEntity;
  entityLabel: string;
  viewName: string;
  viewColumns: ColumnState[];
  userId: string;
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'options' | 'uploading' | 'preview' | 'importing' | 'result';

export default function ImportFromExcelModal({
  entity, entityLabel, viewName, viewColumns, userId,
  onClose, onImportComplete,
}: ImportFromExcelModalProps) {
  const [step, setStep] = useState<Step>('options');
  const [mode, setMode] = useState<ImportMode>('create');
  const [matchColumn, setMatchColumn] = useState<string | null>(null);
  const [columns, setColumns] = useState<ImportColumnMeta[]>([]);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const refDataRef = useRef<any>(null);

  const PREVIEW_PAGE_SIZE = 50;
  const validCount = preview.filter((r) => r.isValid).length;
  const errorCount = preview.filter((r) => !r.isValid).length;

  const handleDownloadTemplate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cols = await resolveImportColumns(entity, viewColumns);
      const refData = await fetchReferenceData(cols, entity);
      const wb = generateTemplate(entityLabel, viewName, cols, refData);
      downloadWorkbook(wb, `${entityLabel.replace(/\s+/g, '_')}_Import_Template.xlsx`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate template');
    } finally {
      setLoading(false);
    }
  }, [entity, entityLabel, viewName, viewColumns]);

  const handleModeChange = (newMode: ImportMode) => {
    setMode(newMode);
    // Default update mode to GUID-based matching
    setMatchColumn(newMode === 'update' ? '__pk__' : null);
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('uploading');
    setLoading(true);
    setError(null);

    try {
      const cols = await resolveImportColumns(entity, viewColumns);
      setColumns(cols);
      const refData = await fetchReferenceData(cols, entity);
      refDataRef.current = refData;

      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setError('The uploaded file contains no data rows.');
        setStep('options');
        setLoading(false);
        return;
      }

      const validated = await validateAndResolve(rows, cols, refData, mode, matchColumn, entity);
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
  }, [entity, viewColumns, mode, matchColumn]);

  const handleImport = useCallback(async () => {
    setStep('importing');
    setLoading(true);
    setError(null);
    try {
      const res = await executeImport(entity, preview, columns, mode, matchColumn, userId);
      setResult(res);
      setStep('result');
      if (res.created > 0 || res.updated > 0) onImportComplete();
    } catch (err: any) {
      setError(err.message ?? 'Import failed');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }, [entity, preview, columns, mode, matchColumn, userId, onImportComplete]);

  const importableColumns = columns.filter((c) => !c.isReadonly);
  const matchableCols = importableColumns.filter((c) =>
    ['text', 'textarea', 'string', 'email', 'phone', 'url'].includes(c.fieldType)
  );
  const isPkMatch = mode === 'update' && matchColumn === '__pk__';

  const pagedPreview = preview.slice(
    previewPage * PREVIEW_PAGE_SIZE,
    (previewPage + 1) * PREVIEW_PAGE_SIZE,
  );
  const totalPreviewPages = Math.ceil(preview.length / PREVIEW_PAGE_SIZE);

  // File upload enabled when: create mode, or update mode with a match column selected
  const fileDisabled = loading || (mode === 'update' && !matchColumn);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-lg shadow-2xl flex flex-col"
        style={{
          width: step === 'preview' || step === 'result' ? 'min(95vw, 1100px)' : 520,
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            {step === 'preview' && (
              <button
                onClick={() => { setStep('options'); setPreview([]); }}
                className="p-1 rounded hover:bg-[var(--ink-50)] text-[var(--ink-500)]"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <FileSpreadsheet size={18} className="text-emerald-600" />
            <h2 className="text-[14px] font-semibold text-[var(--ink-900)]">
              Import From Excel — {entityLabel}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--ink-100)] text-[var(--ink-500)]">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-md bg-red-50 border border-red-200">
              <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-[12px] text-red-700">{error}</span>
            </div>
          )}

          {/* Step: Options */}
          {step === 'options' && (
            <div className="space-y-4">
              {/* Download Template section */}
              <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Download size={15} className="text-emerald-600" />
                  <span className="text-[13px] font-semibold text-[var(--ink-800)]">Download Template</span>
                </div>
                <p className="text-[12px] text-[var(--ink-500)] mb-3">
                  Download an empty Excel template pre-formatted for this entity. Fill it in and upload below.
                </p>
                <button
                  onClick={handleDownloadTemplate}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium rounded
                    bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Download Template
                </button>
              </div>

              {/* Upload section */}
              <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Upload size={15} className="text-blue-600" />
                  <span className="text-[13px] font-semibold text-[var(--ink-800)]">Upload Excel File</span>
                </div>
                <p className="text-[12px] text-[var(--ink-500)] mb-3">
                  Upload a filled template to preview and import records.
                </p>

                {/* Import Mode */}
                <div className="mb-3">
                  <label className="text-[11px] font-semibold text-[var(--ink-600)] uppercase tracking-wide mb-1.5 block">
                    Import Mode
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 'create' as ImportMode, label: 'Create new records' },
                      { value: 'update' as ImportMode, label: 'Update existing' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleModeChange(opt.value)}
                        className={`px-3 py-1.5 text-[11px] font-medium rounded border transition-colors ${
                          mode === opt.value
                            ? 'bg-[var(--navy-accent)] text-white border-[var(--navy-accent)]'
                            : 'bg-white text-[var(--ink-600)] hover:bg-[var(--ink-50)]'
                        }`}
                        style={mode !== opt.value ? { borderColor: 'var(--border)' } : undefined}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Match Column (update mode) */}
                {mode === 'update' && (
                  <div className="mb-3">
                    <label className="text-[11px] font-semibold text-[var(--ink-600)] uppercase tracking-wide mb-1.5 block">
                      Match records by
                    </label>
                    <div className="relative">
                      <FilterSelect
                        value={matchColumn ?? ''}
                        onChange={(e) => setMatchColumn(e.target.value || null)}
                        className="w-full h-[32px] pl-3 pr-8 text-[12px] bg-white border rounded appearance-none text-[var(--ink-700)]
                          focus:outline-none focus:ring-1 focus:ring-[var(--navy-accent)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <option value="">Select a column...</option>
                        <option value="__pk__">{entityLabel} ID (from exported file)</option>
                        {matchableCols.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </FilterSelect>
                      </div>
                    {isPkMatch && (
                      <p className="text-[11px] text-emerald-700 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Records will be matched by their unique ID — use the exported file.
                      </p>
                    )}
                  </div>
                )}

                <label
                  className={`flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg transition-colors ${
                    fileDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/40'
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Upload size={16} className="text-[var(--ink-400)]" />
                  <span className="text-[12px] text-[var(--ink-500)]">Choose .xlsx file or drag &amp; drop</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={fileDisabled}
                  />
                </label>
                {mode === 'update' && !matchColumn && (
                  <p className="text-[11px] text-amber-600 mt-1.5">Select a match column before uploading.</p>
                )}
              </div>
            </div>
          )}

          {/* Step: Uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-[var(--navy-accent)] mb-3" />
              <p className="text-[13px] text-[var(--ink-600)]">Processing file...</p>
              <p className="text-[11px] text-[var(--ink-400)] mt-1">Validating data and resolving references</p>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--ink-50)]">
                  <span className="text-[11px] font-semibold text-[var(--ink-600)]">Total: {preview.length}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span className="text-[11px] font-semibold text-emerald-700">Valid: {validCount}</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50">
                    <AlertTriangle size={13} className="text-red-500" />
                    <span className="text-[11px] font-semibold text-red-700">Errors: {errorCount}</span>
                  </div>
                )}
                <div className="flex-1" />
                <span className="text-[11px] text-[var(--ink-400)]">
                  Mode: {mode === 'create' ? 'Create new' : 'Update existing'}
                </span>
              </div>

              <div className="border rounded-lg overflow-hidden mb-3" style={{ borderColor: 'var(--border)' }}>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: 'var(--ink-50)' }}>
                        <th className="px-2 py-2 text-left font-semibold text-[var(--ink-600)] sticky top-0 bg-[var(--ink-50)] z-10 w-10">#</th>
                        <th className="px-2 py-2 text-left font-semibold text-[var(--ink-600)] sticky top-0 bg-[var(--ink-50)] z-10 w-16">Status</th>
                        {isPkMatch && (
                          <th className="px-2 py-2 text-left font-semibold text-[var(--ink-600)] sticky top-0 bg-[var(--ink-50)] z-10 whitespace-nowrap">
                            {entityLabel} ID
                          </th>
                        )}
                        {importableColumns.map((col) => (
                          <th
                            key={col.key}
                            className="px-2 py-2 text-left font-semibold text-[var(--ink-600)] sticky top-0 bg-[var(--ink-50)] z-10 whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-left font-semibold text-[var(--ink-600)] sticky top-0 bg-[var(--ink-50)] z-10">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPreview.map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={row.isValid ? 'hover:bg-[var(--ink-50)]' : 'bg-red-50/50'}
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          <td className="px-2 py-1.5 text-[var(--ink-400)]">{row.rowIndex}</td>
                          <td className="px-2 py-1.5">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 size={12} /> OK
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-500">
                                <AlertTriangle size={12} /> Error
                              </span>
                            )}
                          </td>
                          {isPkMatch && (
                            <td className="px-2 py-1.5 font-mono text-[10px] text-[var(--ink-400)] max-w-[120px] truncate">
                              {String(row.data['__pk__'] ?? '—')}
                            </td>
                          )}
                          {importableColumns.map((col) => {
                            const val = row.data[col.key];
                            const hasError = row.errors.some((e) => e.column === col.label);
                            return (
                              <td
                                key={col.key}
                                className={`px-2 py-1.5 max-w-[180px] truncate ${hasError ? 'text-red-600 font-medium' : 'text-[var(--ink-700)]'}`}
                              >
                                {val != null && String(val) !== '' ? String(val) : <span className="text-[var(--ink-300)]">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-red-600 max-w-[260px]">
                            {row.errors.length > 0 && (
                              <div className="space-y-0.5">
                                {row.errors.map((e, idx) => (
                                  <div key={idx} className="text-[10px]">
                                    <span className="font-medium">{e.column}:</span> {e.message}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalPreviewPages > 1 && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <button
                    onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    disabled={previewPage === 0}
                    className="px-2 py-1 text-[11px] border rounded disabled:opacity-40"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    Prev
                  </button>
                  <span className="text-[11px] text-[var(--ink-500)]">
                    Page {previewPage + 1} of {totalPreviewPages}
                  </span>
                  <button
                    onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))}
                    disabled={previewPage >= totalPreviewPages - 1}
                    className="px-2 py-1 text-[11px] border rounded disabled:opacity-40"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-[var(--navy-accent)] mb-3" />
              <p className="text-[13px] text-[var(--ink-600)]">Importing records...</p>
              <p className="text-[11px] text-[var(--ink-400)] mt-1">{validCount} record{validCount !== 1 ? 's' : ''} to process</p>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-emerald-800">Import Complete</p>
                  <p className="text-[12px] text-emerald-700 mt-0.5">
                    {result.created > 0 && `${result.created} created`}
                    {result.created > 0 && result.updated > 0 && ', '}
                    {result.updated > 0 && `${result.updated} updated`}
                    {(result.created > 0 || result.updated > 0) && result.skipped > 0 && ', '}
                    {result.skipped > 0 && `${result.skipped} skipped`}
                    {(result.created > 0 || result.updated > 0 || result.skipped > 0) && result.failed > 0 && ', '}
                    {result.failed > 0 && `${result.failed} failed`}
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {step === 'preview' && (
            <>
              <span className="text-[11px] text-[var(--ink-400)] mr-auto">
                {validCount} of {preview.length} rows will be {mode === 'create' ? 'created' : 'updated'}
              </span>
              <button
                onClick={() => { setStep('options'); setPreview([]); }}
                className="px-3 py-1.5 text-[12px] font-medium border rounded text-[var(--ink-600)] hover:bg-[var(--ink-50)] transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={validCount === 0 || loading}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded
                  bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {mode === 'create' ? `Import ${validCount} Record${validCount !== 1 ? 's' : ''}` : `Update ${validCount} Record${validCount !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          {(step === 'result' || step === 'options') && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-[12px] font-medium border rounded text-[var(--ink-600)] hover:bg-[var(--ink-50)] transition-colors"
              style={{ borderColor: 'var(--border)' }}
            >
              {step === 'result' ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
