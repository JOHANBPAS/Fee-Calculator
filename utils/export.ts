
import { escapeHtml } from './formatting';

export function saveBlob(name: string, blob: Blob) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Failed to save blob", e);
  }
}

function toCSV(rows: string[][]): string {
  const esc = (s: string) => (/[,\n"]/).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  return rows.map(r => r.map(esc).join(',')).join('\n');
}

export function exportCsv(filename: string, rows: string[][]) {
    const csv = toCSV(rows);
    saveBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

type ExcelIntroSection = {
  headers: string[];
  rows: string[][];
};

type ExcelExportOptions = {
  intro?: ExcelIntroSection;
};

function renderTable(tableHeaders: string[], tableRows: string[][]) {
  const padRow = (row: string[]) => {
    if (row.length < tableHeaders.length) return [...row, ...Array(tableHeaders.length - row.length).fill('')];
    return row.slice(0, tableHeaders.length);
  };
  const headHtml = `<tr>${tableHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const bodyHtml = tableRows.map(r => `<tr>${padRow(r).map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<table>${headHtml}${bodyHtml}</table>`;
}

export function exportExcelTable(filename: string, headers: string[], rows: string[][], options?: ExcelExportOptions) {
  const styles = `<style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; margin-bottom: 12px; }
    th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
    th { background: #f0f0f0; }
  </style>`;
  const tables: string[] = [];
  if (options?.intro && options.intro.rows.length) {
    tables.push(renderTable(options.intro.headers, options.intro.rows));
  }
  tables.push(renderTable(headers, rows));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8" />${styles}</head><body>${tables.join('')}</body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  saveBlob(filename.endsWith('.xls') ? filename : `${filename}.xls`, blob);
}
