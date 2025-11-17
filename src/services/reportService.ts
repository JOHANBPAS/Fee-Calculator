import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { FeeSnapshot } from '../utils/feeSnapshot';

// A4 portrait in points (roughly 595 x 842)
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// Safe margins for all body content. Adjust here to tighten / loosen the layout.
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 80;
const MARGIN_BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

type PdfFont = ReturnType<PDFDocument['embedFont']>;

interface PageContext {
  pdf: PDFDocument;
  page: ReturnType<PDFDocument['addPage']>;
  fontRegular: PdfFont;
  fontBold: PdfFont;
  y: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// Draw the full-page background first. Replace the fillRect with your image draw if you add a template.
function drawBackground(ctx: PageContext) {
  const { page } = ctx;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(0.07, 0.07, 0.08), // subtle dark base; swap with image if you have one
  });
}

function ensureSpace(ctx: PageContext, neededHeight: number) {
  if (ctx.y - neededHeight < MARGIN_BOTTOM) {
    const { pdf, fontRegular, fontBold } = ctx;
    const nextPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const nextCtx: PageContext = {
      pdf,
      page: nextPage,
      fontRegular,
      fontBold,
      y: PAGE_HEIGHT - MARGIN_TOP,
    };
    drawBackground(nextCtx);
    return nextCtx;
  }
  return ctx;
}

// Wrap text within content width, respecting margins and pagination.
function drawWrappedText(options: {
  ctx: PageContext;
  text: string;
  size: number;
  color?: ReturnType<typeof rgb>;
  lineHeight: number;
  bold?: boolean;
}) {
  const { ctx, text, size, color = rgb(1, 1, 1), lineHeight, bold } = options;
  const font = bold ? ctx.fontBold : ctx.fontRegular;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const tentative = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(tentative, size);
    if (width <= CONTENT_WIDTH) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);

  let ctxRef = ctx;
  lines.forEach((line) => {
    ctxRef = ensureSpace(ctxRef, lineHeight);
    ctxRef.page.drawText(line, {
      x: MARGIN_LEFT,
      y: ctxRef.y - lineHeight,
      size,
      font,
      color,
    });
    ctxRef.y -= lineHeight;
  });
  return ctxRef;
}

function drawHeading(ctx: PageContext, text: string, size: number, color: ReturnType<typeof rgb>) {
  ctx = ensureSpace(ctx, size + 6);
  ctx.page.drawText(text, {
    x: MARGIN_LEFT,
    y: ctx.y - size,
    size,
    font: ctx.fontBold,
    color,
  });
  ctx.y -= size + 6;
  return ctx;
}

function drawKeyValueRows(
  ctx: PageContext,
  rows: Array<{ label: string; value: string }>,
  options: { labelWidth?: number; fontSize?: number; lineHeight?: number } = {},
) {
  const labelWidth = options.labelWidth ?? CONTENT_WIDTH * 0.45;
  const fontSize = options.fontSize ?? 11;
  const lineHeight = options.lineHeight ?? 16;
  let ctxRef = ctx;
  rows.forEach((row) => {
    ctxRef = ensureSpace(ctxRef, lineHeight);
    ctxRef.page.drawText(row.label, {
      x: MARGIN_LEFT,
      y: ctxRef.y - lineHeight,
      size: fontSize,
      font: ctxRef.fontBold,
      color: rgb(0.83, 0.72, 0.45),
    });
    const valueX = MARGIN_LEFT + labelWidth + 8;
    const maxValueWidth = CONTENT_WIDTH - labelWidth - 8;
    const valueLines = wrapManual(row.value, ctxRef.fontRegular, fontSize, maxValueWidth);
    valueLines.forEach((vLine, idx) => {
      if (idx > 0) ctxRef = ensureSpace(ctxRef, lineHeight);
      ctxRef.page.drawText(vLine, {
        x: valueX,
        y: ctxRef.y - lineHeight,
        size: fontSize,
        font: ctxRef.fontRegular,
        color: rgb(1, 1, 1),
      });
      ctxRef.y -= lineHeight;
    });
  });
  return ctxRef;
}

// Manual wrapper used for key-value values to respect shorter column width.
function wrapManual(text: string, font: PdfFont, size: number, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const tentative = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(tentative, size);
    if (width <= maxWidth) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawSimpleList(ctx: PageContext, items: string[], opts: { size?: number; lineHeight?: number } = {}) {
  const size = opts.size ?? 10;
  const lineHeight = opts.lineHeight ?? 14;
  let ctxRef = ctx;
  items.forEach((line) => {
    ctxRef = drawWrappedText({
      ctx: ctxRef,
      text: line,
      size,
      lineHeight,
    });
  });
  return ctxRef;
}

export async function generateSnapshotPdf(snapshot: FeeSnapshot, projectName: string) {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let ctx: PageContext = {
    pdf,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    fontRegular,
    fontBold,
    y: PAGE_HEIGHT - MARGIN_TOP,
  };
  drawBackground(ctx);

  // Header
  ctx = drawHeading(ctx, 'Fee Report', 20, rgb(0.96, 0.76, 0.27));
  ctx = drawWrappedText({
    ctx,
    text: `Project: ${projectName || snapshot.clientName || 'Untitled Project'}`,
    size: 12,
    lineHeight: 16,
  });
  ctx = drawWrappedText({
    ctx,
    text: `Client: ${snapshot.clientName || 'Not specified'}`,
    size: 12,
    lineHeight: 16,
  });
  ctx = drawWrappedText({
    ctx,
    text: `Saved at: ${new Date(snapshot.savedAt).toLocaleString()}`,
    size: 12,
    lineHeight: 16,
  });
  ctx.y -= 12;

  // Key Inputs
  ctx = drawHeading(ctx, 'Key Inputs', 14, rgb(0.96, 0.76, 0.27));
  ctx = drawKeyValueRows(
    ctx,
    [
      ...snapshot.projectDetails.rows.map(([label, val]) => ({ label, value: val })),
      { label: 'VAT', value: `${snapshot.vatPct}%` },
    ],
    { labelWidth: CONTENT_WIDTH * 0.5, fontSize: 11, lineHeight: 16 },
  );
  ctx.y -= 10;

  // Basket Summary
  ctx = drawHeading(ctx, 'Basket Summary', 14, rgb(0.96, 0.76, 0.27));
  const basketRows = snapshot.basket.rows.map(
    (row) =>
      `${row.label} (${row.group}) — Base: ${formatCurrency(row.baseFee)}, Proposed: ${formatCurrency(
        row.proposedFee,
      )} (${row.effectivePct.toFixed(2)}% of VOW)`,
  );
  ctx = drawSimpleList(ctx, basketRows, { size: 10, lineHeight: 14 });
  ctx = drawSimpleList(
    ctx,
    [
      `Subtotal: ${formatCurrency(snapshot.basket.subtotal)}`,
      `VAT (${snapshot.vatPct}%): ${formatCurrency(snapshot.totals.vatAmount)}`,
      `Total incl. VAT: ${formatCurrency(snapshot.totals.totalWithVat)}`,
    ],
    { size: 11, lineHeight: 15 },
  );
  ctx.y -= 12;

  // SACAP Summary
  ctx = drawHeading(ctx, 'SACAP Summary', 14, rgb(0.96, 0.76, 0.27));
  ctx = drawSimpleList(
    ctx,
    [
      `VOW: ${formatCurrency(snapshot.sacap.vow)} | Base fee: ${formatCurrency(snapshot.sacap.baseFee)} | Complexity: ${
        snapshot.sacap.complexity
      }`,
      `Subtotal ex VAT: ${formatCurrency(snapshot.sacap.subtotal)} | VAT: ${formatCurrency(
        snapshot.sacap.vat,
      )} | Total: ${formatCurrency(snapshot.sacap.total)}`,
    ],
    { size: 11, lineHeight: 15 },
  );
  const sacapStages = snapshot.sacap.stages
    .filter((s) => s.enabled)
    .map(
      (stage) =>
        `${stage.name} – ${formatCurrency(stage.amount)} (Stage ${stage.pct}% | Discount ${stage.discountPct || 0}%)`,
    );
  ctx = drawSimpleList(ctx, sacapStages, { size: 10, lineHeight: 14 });
  ctx.y -= 12;

  // BIM Summary
  ctx = drawHeading(ctx, 'BIM Summary', 14, rgb(0.96, 0.76, 0.27));
  ctx = drawSimpleList(
    ctx,
    [
      `Method: ${snapshot.bim.method === 'per_m2' ? 'Per m²' : 'Hourly'} | Area: ${snapshot.bim.area.toLocaleString(
        'en-ZA',
      )} m² | Preset: ${snapshot.bim.preset}`,
      `Subtotal ex VAT: ${formatCurrency(snapshot.bim.subtotal)} | VAT: ${formatCurrency(
        snapshot.bim.vat,
      )} | Total: ${formatCurrency(snapshot.bim.total)}`,
      `Timeline est.: Scan ${snapshot.bim.timeline.scanDays.toFixed(1)} days, Reg ${snapshot.bim.timeline.regHoursEst.toFixed(
        1,
      )} hrs, Model ${snapshot.bim.timeline.modelDays.toFixed(1)} days`,
    ],
    { size: 11, lineHeight: 15 },
  );
  ctx.y -= 12;

  // Hourly Summary
  ctx = drawHeading(ctx, 'Hourly Summary', 14, rgb(0.96, 0.76, 0.27));
  ctx = drawSimpleList(
    ctx,
    [
      `Project: ${snapshot.hourly.projectName || 'Hourly work'}`,
      `Subtotal ex VAT: ${formatCurrency(snapshot.hourly.subtotal)} | VAT: ${formatCurrency(
        snapshot.hourly.vat,
      )} | Total: ${formatCurrency(snapshot.hourly.total)}`,
    ],
    { size: 11, lineHeight: 15 },
  );
  const hourlyPhases = snapshot.hourly.phases.map((phase) => `${phase.name}: ${formatCurrency(phase.amount)}`);
  ctx = drawSimpleList(ctx, hourlyPhases, { size: 10, lineHeight: 14 });

  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

export async function downloadSnapshotPdf(snapshot: FeeSnapshot, projectName: string) {
  const blob = await generateSnapshotPdf(snapshot, projectName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${projectName || snapshot.clientName || 'fee-report'}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
