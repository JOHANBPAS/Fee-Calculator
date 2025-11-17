import type { PdfRun } from '../types';

// Shared page + grid constants for all PDFs
export const PAGE_WIDTH = 595.28; // A4 width in points
export const PAGE_HEIGHT = 841.89; // A4 height in points

// Safe content margins. Adjust here if the background design changes.
export const MARGIN_LEFT = 40;
export const MARGIN_RIGHT = 40;
export const MARGIN_TOP = 80;
export const MARGIN_BOTTOM = 60;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

export type ColumnDef = { x: number; width: number; align?: 'left' | 'right' | 'center' };

export interface PdfDoc {
  pages: PdfRun[][];
  current: PdfRun[];
  cursorY: number;
  columns: {
    label: ColumnDef;
    mid: ColumnDef;
    value: ColumnDef;
  };
}

// Create a new document with a first page and background.
export function createPdfDoc(): PdfDoc {
  const columns = {
    // Column widths are chosen to sum <= CONTENT_WIDTH. Adjust for your design if needed.
    label: { x: MARGIN_LEFT, width: CONTENT_WIDTH * 0.45, align: 'left' as const },
    mid: { x: MARGIN_LEFT + CONTENT_WIDTH * 0.45 + 8, width: CONTENT_WIDTH * 0.2, align: 'left' as const },
    value: { x: MARGIN_LEFT + CONTENT_WIDTH * 0.65 + 16, width: CONTENT_WIDTH * 0.35 - 16, align: 'right' as const },
  };
  const page: PdfRun[] = [];
  drawBackground(page);
  return {
    pages: [page],
    current: page,
    cursorY: PAGE_HEIGHT - MARGIN_TOP,
    columns,
  };
}

// Push a full-page background. Replace the fill color with an image if you have a template.
export function drawBackground(page: PdfRun[]) {
  page.push({
    kind: 'rect',
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    fill: [1,1,1],
  });
}

// Start a new page when there is not enough vertical space.
export function ensureSpace(doc: PdfDoc, neededHeight: number) {
  if (doc.cursorY - neededHeight < MARGIN_BOTTOM) {
    const page: PdfRun[] = [];
    drawBackground(page);
    doc.pages.push(page);
    doc.current = page;
    doc.cursorY = PAGE_HEIGHT - MARGIN_TOP;
  }
}

// Very lightweight text width estimation for wrapping inside a column (Helvetica-ish average width).
function estimateWidth(text: string, size: number) {
  const averageCharWidth = size * 0.55;
  return text.length * averageCharWidth;
}

// Wrap text into lines that fit the provided column width.
export function wrapLines(text: string, maxWidth: number, size: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const tentative = current ? `${current} ${word}` : word;
    if (estimateWidth(tentative, size) <= maxWidth) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

// Draw text within a column, supporting left/center/right alignment and wrapping.
export function drawTextInColumn(doc: PdfDoc, text: string, column: ColumnDef, opts?: { size?: number; lineHeight?: number; color?: [number, number, number] }) {
  const size = opts?.size ?? 10;
  const lineHeight = opts?.lineHeight ?? size + 2;
  const color = opts?.color ?? [0.07, 0.07, 0.08];
  const lines = wrapLines(text, column.width, size);
  lines.forEach((line) => {
    ensureSpace(doc, lineHeight);
    let x = column.x;
    const textWidth = estimateWidth(line, size);
    if (column.align === 'right') {
      x = column.x + column.width - textWidth;
    } else if (column.align === 'center') {
      x = column.x + (column.width - textWidth) / 2;
    }
    doc.current.push({ text: line, x, y: doc.cursorY - lineHeight, size, color, font: 'regular' });
    doc.cursorY -= lineHeight;
  });
}

// Draw a heading (always bold, within the safe area).
export function drawHeading(doc: PdfDoc, text: string, size = 14, color: [number, number, number] = [0.96, 0.76, 0.27]) {
  const lineHeight = size + 4;
  ensureSpace(doc, lineHeight);
  doc.current.push({ text, x: MARGIN_LEFT, y: doc.cursorY - lineHeight, size, color, font: 'bold' });
  doc.cursorY -= lineHeight;
}

// Draw a simple key/value row spanning the full content width.
export function drawKeyValue(doc: PdfDoc, label: string, value: string, opts?: { size?: number; lineHeight?: number }) {
  const size = opts?.size ?? 11;
  const lineHeight = opts?.lineHeight ?? 16;
  const labelCol: ColumnDef = { x: MARGIN_LEFT, width: CONTENT_WIDTH * 0.45, align: 'left' };
  const valueCol: ColumnDef = { x: MARGIN_LEFT + CONTENT_WIDTH * 0.45 + 8, width: CONTENT_WIDTH * 0.55 - 8, align: 'left' };
  const linesLabel = wrapLines(label, labelCol.width, size);
  const linesValue = wrapLines(value, valueCol.width, size);
  const rows = Math.max(linesLabel.length, linesValue.length);
  for (let i = 0; i < rows; i += 1) {
    ensureSpace(doc, lineHeight);
    const l = linesLabel[i] ?? '';
    const v = linesValue[i] ?? '';
    doc.current.push({ text: l, x: labelCol.x, y: doc.cursorY - lineHeight, size, color: [0.83, 0.72, 0.45], font: 'bold' });
    doc.current.push({ text: v, x: valueCol.x, y: doc.cursorY - lineHeight, size, color: [0.07, 0.07, 0.08], font: 'regular' });
    doc.cursorY -= lineHeight;
  }
}

// Draw rows given a set of column definitions per row.
export function drawTableRows(doc: PdfDoc, rows: Array<Array<{ text: string; column: ColumnDef; size?: number; color?: [number, number, number] }>>, lineHeight = 16) {
  rows.forEach((row) => {
    // Compute height needed for this row based on wrapped lines per cell.
    const cellHeights = row.map((cell) => {
      const size = cell.size ?? 10;
      const lines = wrapLines(cell.text, cell.column.width, size);
      return lines.length * lineHeight;
    });
    const rowHeight = Math.max(...cellHeights, lineHeight);
    ensureSpace(doc, rowHeight);

    row.forEach((cell) => {
      const size = cell.size ?? 10;
      const lines = wrapLines(cell.text, cell.column.width, size);
      lines.forEach((line, idx) => {
        let x = cell.column.x;
        const textWidth = estimateWidth(line, size);
        if (cell.column.align === 'right') {
          x = cell.column.x + cell.column.width - textWidth;
        } else if (cell.column.align === 'center') {
          x = cell.column.x + (cell.column.width - textWidth) / 2;
        }
        const y = doc.cursorY - lineHeight * (idx + 1);
        doc.current.push({ text: line, x, y, size, color: cell.color ?? [0.07, 0.07, 0.08], font: 'regular' });
      });
    });
    doc.cursorY -= rowHeight + 2; // spacing between rows
  });
}

// Finish and get all pages; used with createSimplePdfFromPages.
export function finishDoc(doc: PdfDoc) {
  return doc.pages;
}
