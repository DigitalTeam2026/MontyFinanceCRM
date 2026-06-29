/**
 * Lazy XLSX export helper.
 *
 * Importing this module does NOT pull the ~400KB `xlsx` library into the bundle
 * graph — the library is fetched on demand the first time an export actually
 * runs (a user clicking Export). This keeps `xlsx` out of the initial page load,
 * which is otherwise paid for on every list view that offers an export button.
 */
export interface XlsxSheet {
  name: string;
  /** Array-of-arrays; the first row is treated as the header row. */
  rows: unknown[][];
  /** Optional per-column widths (Excel "wch" character units). */
  colWidths?: number[];
}

/** Build a workbook from one or more sheets and trigger a browser download. */
export async function exportSheetsToXlsx(sheets: XlsxSheet[], filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.colWidths) ws['!cols'] = s.colWidths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  const safe = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const data: Uint8Array = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([data as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
