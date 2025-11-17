import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { FeeSnapshot } from '../utils/feeSnapshot';

function drawTextBlock(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  size: number,
  color = rgb(1, 1, 1),
) {
  page.drawText(text, { x, y, size, color });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

export async function generateSnapshotPdf(snapshot: FeeSnapshot, projectName: string) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { height, width } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;
  const lineHeight = 16;

  page.setFont(fontBold);
  page.setFontSize(18);
  drawTextBlock(page, 'Fee Report', 40, y, 18, rgb(0.96, 0.76, 0.27));
  y -= lineHeight * 2;

  page.setFont(fontRegular);
  page.setFontSize(12);
  const headerLines = [
    `Project: ${projectName || snapshot.clientName || 'Untitled Project'}`,
    `Client: ${snapshot.clientName || 'Not specified'}`,
    `Saved at: ${new Date(snapshot.savedAt).toLocaleString()}`,
  ];
  headerLines.forEach((line) => {
    drawTextBlock(page, line, 40, y, 12);
    y -= lineHeight;
  });
  y -= lineHeight;

  page.setFont(fontBold);
  drawTextBlock(page, 'Key Inputs', 40, y, 13);
  y -= lineHeight;
  page.setFont(fontRegular);
  const details = snapshot.projectDetails.rows;
  details.forEach(([label, value]) => {
    drawTextBlock(page, `${label}: ${value}`, 40, y, 11);
    y -= lineHeight;
  });
  drawTextBlock(page, `VAT: ${snapshot.vatPct}%`, 40, y, 11);
  y -= lineHeight * 2;

  page.setFont(fontBold);
  drawTextBlock(page, 'Basket Summary', 40, y, 13);
  y -= lineHeight;
  page.setFont(fontRegular);
  snapshot.basket.rows.slice(0, 14).forEach((row) => {
    drawTextBlock(
      page,
      `${row.label} (${row.group}) - Base: ${formatCurrency(row.baseFee)}, Proposed: ${formatCurrency(row.proposedFee)} (${row.effectivePct.toFixed(2)}% of VOW)`,
      40,
      y,
      10,
    );
    y -= lineHeight;
  });
  y -= lineHeight;
  drawTextBlock(page, `Subtotal: ${formatCurrency(snapshot.basket.subtotal)}`, 40, y, 12);
  y -= lineHeight;
  drawTextBlock(page, `VAT (${snapshot.vatPct}%): ${formatCurrency(snapshot.totals.vatAmount)}`, 40, y, 12);
  y -= lineHeight;
  drawTextBlock(page, `Total incl. VAT: ${formatCurrency(snapshot.totals.totalWithVat)}`, 40, y, 12);
  y -= lineHeight * 2;

  page.setFont(fontBold);
  drawTextBlock(page, 'SACAP Summary', 40, y, 13);
  y -= lineHeight;
  page.setFont(fontRegular);
  drawTextBlock(page, `VOW: ${formatCurrency(snapshot.sacap.vow)} | Base fee: ${formatCurrency(snapshot.sacap.baseFee)} | Complexity: ${snapshot.sacap.complexity}`, 40, y, 11);
  y -= lineHeight;
  drawTextBlock(
    page,
    `Subtotal ex VAT: ${formatCurrency(snapshot.sacap.subtotal)} | VAT: ${formatCurrency(snapshot.sacap.vat)} | Total: ${formatCurrency(snapshot.sacap.total)}`,
    40,
    y,
    11,
  );
  y -= lineHeight;
  page.setFont(fontRegular);
  snapshot.sacap.stages
    .filter((s) => s.enabled)
    .slice(0, 5)
    .forEach((stage) => {
      drawTextBlock(page, `${stage.name} – ${formatCurrency(stage.amount)} (Stage ${stage.pct}% | Discount ${stage.discountPct || 0}%)`, 40, y, 10);
      y -= lineHeight;
    });
  y -= lineHeight;

  page.setFont(fontBold);
  drawTextBlock(page, 'BIM Summary', 40, y, 13);
  y -= lineHeight;
  page.setFont(fontRegular);
  drawTextBlock(
    page,
    `Method: ${snapshot.bim.method === 'per_m2' ? 'Per m²' : 'Hourly'} | Area: ${snapshot.bim.area.toLocaleString('en-ZA')} m² | Preset: ${snapshot.bim.preset}`,
    40,
    y,
    11,
  );
  y -= lineHeight;
  drawTextBlock(
    page,
    `Subtotal ex VAT: ${formatCurrency(snapshot.bim.subtotal)} | VAT: ${formatCurrency(snapshot.bim.vat)} | Total: ${formatCurrency(snapshot.bim.total)}`,
    40,
    y,
    11,
  );
  y -= lineHeight;
  drawTextBlock(
    page,
    `Timeline est.: Scan ${snapshot.bim.timeline.scanDays.toFixed(1)} days, Reg ${snapshot.bim.timeline.regHoursEst.toFixed(1)} hrs, Model ${snapshot.bim.timeline.modelDays.toFixed(1)} days`,
    40,
    y,
    10,
  );
  y -= lineHeight * 2;

  page.setFont(fontBold);
  drawTextBlock(page, 'Hourly Summary', 40, y, 13);
  y -= lineHeight;
  page.setFont(fontRegular);
  drawTextBlock(page, `Project: ${snapshot.hourly.projectName || 'Hourly work'}`, 40, y, 11);
  y -= lineHeight;
  drawTextBlock(
    page,
    `Subtotal ex VAT: ${formatCurrency(snapshot.hourly.subtotal)} | VAT: ${formatCurrency(snapshot.hourly.vat)} | Total: ${formatCurrency(snapshot.hourly.total)}`,
    40,
    y,
    11,
  );
  y -= lineHeight;
  snapshot.hourly.phases.slice(0, 4).forEach((phase) => {
    drawTextBlock(page, `${phase.name}: ${formatCurrency(phase.amount)}`, 40, y, 10);
    y -= lineHeight;
  });

  const pdfBytes = await pdfDoc.save();
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
