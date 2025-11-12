import React, { useEffect } from 'react';
import type { BimMethod, BimPreset, PdfRun } from '../types';
import { useLocalStorageNumber, useLocalStorageState, useLocalStorageString } from '../hooks/useLocalStorage';
import { currency, currencyPlain } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages, SIMPLE_PDF_PAGE } from '../services/pdfService';
import { HOURS_PER_DAY, SCAN_M2_PER_DAY, MODEL_M2_PER_DAY, BIM_PRESETS, HOURLY_BIM_RATE, BRAND_COLORS } from '../constants';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';

interface BimSectionProps {
  clientName: string;
  vatPct: number;
}

export function BimSection({ clientName, vatPct }: BimSectionProps) {
  const [bimMethod, setBimMethod] = useLocalStorageString('bimMethod', 'per_m2') as [BimMethod, (v: BimMethod) => void];
  const [bimArea, setBimArea] = useLocalStorageNumber('bimArea', 1000);
  const [bimRates, setBimRates] = useLocalStorageState<{ scan: number; reg: number; model: number }>('bimRates', { scan: 8.35, reg: 2.5, model: 9.75 });
  const [bimPreset, setBimPreset] = useLocalStorageString('bimPreset', 'auto') as [BimPreset, (v: BimPreset) => void];
  const [bimOverrideScan, setBimOverrideScan] = useLocalStorageNumber('bimOverrideScan', 0);
  const [bimOverrideReg, setBimOverrideReg] = useLocalStorageNumber('bimOverrideReg', 0);
  const [bimOverrideModel, setBimOverrideModel] = useLocalStorageNumber('bimOverrideModel', 0);
  const [bimHrsScan, setBimHrsScan] = useLocalStorageNumber('bimHrsScan', 0);
  const [bimHrsReg, setBimHrsReg] = useLocalStorageNumber('bimHrsReg', 0);
  const [bimHrsModel, setBimHrsModel] = useLocalStorageNumber('bimHrsModel', 0);

  const scanDays = bimArea > 0 ? bimArea / SCAN_M2_PER_DAY : 0;
  const scanHours = scanDays * HOURS_PER_DAY;
  const regHoursEst = scanHours / 8; // 1 hour of registration per 8 hours of scanning
  const modelDays = bimArea > 0 ? bimArea / MODEL_M2_PER_DAY : 0;
  const modelHoursEst = modelDays * HOURS_PER_DAY;

  const scanAmount = bimOverrideScan > 0 ? bimOverrideScan : bimRates.scan * bimArea;
  const regAmount = bimOverrideReg > 0 ? bimOverrideReg : bimRates.reg * bimArea;
  const modelAmount = bimOverrideModel > 0 ? bimOverrideModel : bimRates.model * bimArea;
  const subtotalBim = scanAmount + regAmount + modelAmount;
  const vatBim = subtotalBim * (vatPct / 100);
  const totalBim = subtotalBim + vatBim;

  const subtotalHrs = (bimHrsScan + bimHrsReg + bimHrsModel) * HOURLY_BIM_RATE;
  const vatHrs = subtotalHrs * (vatPct / 100);
  const totalHrs = subtotalHrs + vatHrs;

  useEffect(() => {
    if (bimMethod !== 'per_m2' || bimPreset !== 'auto') return;
    if (bimArea > 1000) setBimRates(BIM_PRESETS.large);
    else if (bimArea < 500) setBimRates(BIM_PRESETS.homes);
  }, [bimArea, bimMethod, bimPreset, setBimRates]);

  const handleExportExcel = () => {
    let headers: string[];
    let rows: string[][];
    if (bimMethod === 'per_m2') {
      headers = ['Item', 'Amount'];
      rows = [
        ['Scanning', currencyPlain(scanAmount)],
        ['Registration', currencyPlain(regAmount)],
        ['Modelling', currencyPlain(modelAmount)],
        [],
        ['Subtotal', currencyPlain(subtotalBim)],
        [`VAT (${vatPct}%)`, currencyPlain(vatBim)],
        ['Total', currencyPlain(totalBim)],
      ];
    } else {
      headers = ['Item', 'Hours', 'Rate', 'Amount'];
      rows = [
        ['Scanning', String(bimHrsScan), currencyPlain(HOURLY_BIM_RATE), currencyPlain(bimHrsScan * HOURLY_BIM_RATE)],
        ['Registration', String(bimHrsReg), currencyPlain(HOURLY_BIM_RATE), currencyPlain(bimHrsReg * HOURLY_BIM_RATE)],
        ['Modelling', String(bimHrsModel), currencyPlain(HOURLY_BIM_RATE), currencyPlain(bimHrsModel * HOURLY_BIM_RATE)],
        [],
        ['Subtotal', '', '', currencyPlain(subtotalHrs)],
        [`VAT (${vatPct}%)`, '', '', currencyPlain(vatHrs)],
        ['Total', '', '', currencyPlain(totalHrs)],
      ];
    }
    const projectDetails = getProjectDetailsSnapshot({ clientName });
    const introRows = [...projectDetails.rows, ['Exported On', formatExportDate()]];
    exportExcelTable('bim_summary.xls', headers, rows, { intro: { headers: ['Project Detail', 'Value'], rows: introRows } });
  };
  
  const handleExportPdf = () => {
    const projectDetails = getProjectDetailsSnapshot({ clientName });
    const detailRows = [...projectDetails.rows, ['Exported On', formatExportDate()]];
    const pages: PdfRun[][] = [];
    const brand = BRAND_COLORS;
    const margin = 48;
    const width = SIMPLE_PDF_PAGE.width - margin * 2;
    const tableWidth = width + 20;
    const headerX = margin - 10;
    const columnX = bimMethod === 'per_m2'
      ? [margin, margin + 220, margin + 360, margin + 470]
      : [margin, margin + 160, margin + 300, margin + 420];
    let cur: PdfRun[] = [];
    let y = 0;

    const rect = (x: number, top: number, w: number, h: number, fill?: [number, number, number], stroke?: [number, number, number], strokeWidth?: number) => {
      cur.push({ kind: 'rect', x, y: top - h, width: w, height: h, fill, stroke, strokeWidth });
    };
    const text = (value: string, x: number, yPos: number, size = 10, bold = false, color = brand.charcoal) => {
      cur.push({ text: value, x, y: yPos, size, font: bold ? 'bold' : 'regular', color });
    };

    const drawHeader = (withDetails: boolean) => {
      const headerHeight = 70;
      rect(headerX, y, tableWidth, headerHeight, brand.charcoal);
      rect(headerX, y - headerHeight - 4, tableWidth, 4, brand.accent);
      text('Fee Proposal', margin, y - 26, 18, true, brand.light);
      text('BIM Fee Summary', margin, y - 44, 12, false, brand.light);
      text(projectDetails.clientName || 'Unnamed Client', margin + width - 160, y - 28, 9, false, brand.light);
      text(detailRows.at(-1)?.[1] ?? '', margin + width - 160, y - 42, 9, false, brand.light);
      y -= headerHeight + 18;
      if (withDetails) {
        detailRows.forEach(([label, value]) => {
          const rowHeight = 20;
          rect(headerX, y, tableWidth, rowHeight, brand.light);
          text(label, margin, y - 6, 9, true, brand.slate);
          text(value, margin + width / 2, y - 6, 10, false, brand.charcoal);
          y -= rowHeight;
        });
        y -= 10;
      }
    };

    const startPage = (withDetails: boolean) => {
      cur = [];
      y = SIMPLE_PDF_PAGE.height - margin;
      drawHeader(withDetails);
    };

    const checkBreak = (space = 60) => {
      if (y < margin + space) {
        pages.push(cur);
        startPage(false);
      }
    };

    const addRow = (cols: string[], opts?: { header?: boolean; bold?: boolean }) => {
      checkBreak(opts?.header ? 90 : 60);
      if (opts?.header) rect(headerX, y + 6, tableWidth, 18, brand.slate);
      cols.forEach((val, idx) => {
        text(val, columnX[idx], y, opts?.header ? 9 : 10, opts?.header || opts?.bold, opts?.header ? brand.light : brand.charcoal);
      });
      y -= opts?.header ? 18 : 16;
    };

    const addSummary = (label: string, value: string, highlight = false) => {
      const rowHeight = 20;
      checkBreak();
      rect(headerX, y, tableWidth, rowHeight, highlight ? brand.accent : brand.light);
      text(label, margin, y - 6, 10, true, highlight ? brand.charcoal : brand.slate);
      text(value, margin + width - 80, y - 6, 10, true, brand.charcoal);
      y -= rowHeight;
    };

    const addCards = () => {
      const cards: [string, string][] = bimMethod === 'per_m2'
        ? [
            ['Method', 'Per m²'],
            ['Gross Area', `${bimArea.toLocaleString('en-ZA')} m²`],
            ['Preset', bimPreset === 'auto' ? 'Auto' : bimPreset],
          ]
        : [
            ['Method', 'Hourly'],
            ['Hourly Rate', currencyPlain(HOURLY_BIM_RATE)],
            ['Total Hours', String(bimHrsScan + bimHrsReg + bimHrsModel)],
          ];
      const cardWidth = (width - 20) / cards.length;
      checkBreak(140);
      cards.forEach(([label, value], idx) => {
        const cardX = margin + idx * (cardWidth + 10);
        rect(cardX, y, cardWidth, 42, brand.light);
        text(label, cardX + 6, y - 14, 9, true, brand.slate);
        text(value, cardX + 6, y - 26, 12, true, brand.charcoal);
      });
      y -= 48;
    };

    startPage(true);
    addCards();
    addRow(
      bimMethod === 'per_m2' ? ['Item', 'Rate', 'Area', 'Amount'] : ['Item', 'Hours', 'Rate', 'Amount'],
      { header: true },
    );

    if (bimMethod === 'per_m2') {
      addRow(['Scanning', currencyPlain(bimRates.scan), `${bimArea.toLocaleString('en-ZA')} m²`, currencyPlain(scanAmount)]);
      addRow(['Registration', currencyPlain(bimRates.reg), `${bimArea.toLocaleString('en-ZA')} m²`, currencyPlain(regAmount)]);
      addRow(['Modelling', currencyPlain(bimRates.model), `${bimArea.toLocaleString('en-ZA')} m²`, currencyPlain(modelAmount)]);
      y -= 8;
      addSummary('Subtotal (ex VAT)', currencyPlain(subtotalBim));
      addSummary(`VAT (${vatPct}%)`, currencyPlain(vatBim));
      addSummary('TOTAL (inc VAT)', currencyPlain(totalBim), true);
    } else {
      addRow(['Scanning', String(bimHrsScan), currencyPlain(HOURLY_BIM_RATE), currencyPlain(bimHrsScan * HOURLY_BIM_RATE)]);
      addRow(['Registration', String(bimHrsReg), currencyPlain(HOURLY_BIM_RATE), currencyPlain(bimHrsReg * HOURLY_BIM_RATE)]);
      addRow(['Modelling', String(bimHrsModel), currencyPlain(HOURLY_BIM_RATE), currencyPlain(bimHrsModel * HOURLY_BIM_RATE)]);
      y -= 8;
      addSummary('Subtotal (ex VAT)', currencyPlain(subtotalHrs));
      addSummary(`VAT (${vatPct}%)`, currencyPlain(vatHrs));
      addSummary('TOTAL (inc VAT)', currencyPlain(totalHrs), true);
    }

    pages.push(cur);
    saveBlob('bim_summary.pdf', createSimplePdfFromPages(pages));
  };



  return (
    <section className='p-3 bg-zinc-900 rounded-2xl shadow space-y-4'>
      <h2 className='text-lg font-medium'>BIM Scanning & Modelling</h2>
      <div className='grid md:grid-cols-3 gap-3'>
        <div>
          <div className='text-sm mb-1'>Method</div>
          <select value={bimMethod} onChange={(e) => setBimMethod(e.target.value as BimMethod)} className='w-full bg-zinc-800 rounded-xl p-2'>
            <option value='per_m2'>Per m2</option>
            <option value='per_hour'>Hourly</option>
          </select>
        </div>
        <div>
          <div className='text-sm mb-1'>Area (m2)</div>
          <input type='number' min={0} step={10} className='w-full bg-zinc-800 rounded-xl p-2' value={bimArea} onChange={(e) => setBimArea(Number(e.target.value))} />
        </div>
        <div>
          <div className='text-sm mb-1'>Preset</div>
          <select className='w-full bg-zinc-800 rounded-xl p-2' value={bimPreset} onChange={(e) => {
            const v = e.target.value as BimPreset;
            setBimPreset(v);
            if (v === 'homes') setBimRates(BIM_PRESETS.homes);
            else if (v === 'large') setBimRates(BIM_PRESETS.large);
          }} disabled={bimMethod !== 'per_m2'}>
            <option value='auto'>Auto (by area)</option>
            <option value='homes'>Houses (&lt; 500 m2)</option>
            <option value='large'>Large (&gt; 1000 m2)</option>
            <option value='custom'>Custom</option>
          </select>
        </div>
      </div>

      {bimMethod === 'per_m2' ? (
        <div className='p-3 bg-zinc-800/50 rounded-xl space-y-3'>
          <div className='grid md:grid-cols-3 gap-3 text-sm'>
             <div><div className='text-sm mb-1'>Rate/m2: Scan</div><input type='number' min={0} step={0.01} className='w-full bg-zinc-800 rounded-xl p-2' value={bimRates.scan} onChange={(e) => setBimRates(cur => ({ ...cur, scan: Number(e.target.value) }))} /></div>
             <div><div className='text-sm mb-1'>Rate/m2: Registration</div><input type='number' min={0} step={0.01} className='w-full bg-zinc-800 rounded-xl p-2' value={bimRates.reg} onChange={(e) => setBimRates(cur => ({ ...cur, reg: Number(e.target.value) }))} /></div>
             <div><div className='text-sm mb-1'>Rate/m2: Model</div><input type='number' min={0} step={0.01} className='w-full bg-zinc-800 rounded-xl p-2' value={bimRates.model} onChange={(e) => setBimRates(cur => ({ ...cur, model: Number(e.target.value) }))} /></div>
          </div>
          <div className='grid md:grid-cols-3 gap-3 text-sm'>
             <div><div className='text-sm mb-1'>Scanning Amount</div><div className='p-2 bg-zinc-800 rounded-xl text-lg font-semibold'>{currency(scanAmount)}</div></div>
             <div><div className='text-sm mb-1'>Registration Amount</div><div className='p-2 bg-zinc-800 rounded-xl text-lg font-semibold'>{currency(regAmount)}</div></div>
             <div><div className='text-sm mb-1'>Modelling Amount</div><div className='p-2 bg-zinc-800 rounded-xl text-lg font-semibold'>{currency(modelAmount)}</div></div>
          </div>
           <div className='p-3 bg-zinc-900/50 rounded-xl space-y-2'>
                <h3 className='text-sm font-medium'>Estimated Timeline</h3>
                <div className='grid md:grid-cols-3 gap-3 text-sm'>
                    <div><div className='text-xs text-zinc-400 mb-1'>Scanning (~{SCAN_M2_PER_DAY} m²/day)</div><div className='p-2 bg-zinc-800 rounded-xl'>{scanDays.toFixed(1)} days ({scanHours.toFixed(1)} hrs)</div></div>
                    <div><div className='text-xs text-zinc-400 mb-1'>Registration (1hr / 8 scan hrs)</div><div className='p-2 bg-zinc-800 rounded-xl'>{regHoursEst.toFixed(1)} hours</div></div>
                    <div><div className='text-xs text-zinc-400 mb-1'>Modelling (~{MODEL_M2_PER_DAY} m²/day)</div><div className='p-2 bg-zinc-800 rounded-xl'>{modelDays.toFixed(1)} days ({modelHoursEst.toFixed(1)} hrs)</div></div>
                </div>
            </div>
          <div className='grid md:grid-cols-3 gap-3 text-sm'>
            <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>Subtotal</div><div className='text-lg font-semibold'>{currency(subtotalBim)}</div></div>
            <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>VAT ({vatPct}%)</div><div className='text-lg font-semibold'>{currency(vatBim)}</div></div>
            <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>Total</div><div className='text-lg font-semibold'>{currency(totalBim)}</div></div>
          </div>
        </div>
      ) : (
        <div className='p-3 bg-zinc-800/50 rounded-xl space-y-3'>
          <div className='grid md:grid-cols-4 gap-3 items-end'>
            <div className='p-3 rounded-xl bg-zinc-800'>
                <div className='text-xs text-zinc-400'>Hourly Rate</div>
                <div className='text-lg font-semibold'>{currency(HOURLY_BIM_RATE)}</div>
            </div>
            <div><div className='text-sm mb-1'>Scanning (hours)</div><input type='number' min={0} className='w-full bg-zinc-800 rounded-xl p-2' value={bimHrsScan} onChange={(e) => setBimHrsScan(Number(e.target.value))} /></div>
            <div><div className='text-sm mb-1'>Registration (hours)</div><input type='number' min={0} className='w-full bg-zinc-800 rounded-xl p-2' value={bimHrsReg} onChange={(e) => setBimHrsReg(Number(e.target.value))} /></div>
            <div><div className='text-sm mb-1'>Modelling (hours)</div><input type='number' min={0} className='w-full bg-zinc-800 rounded-xl p-2' value={bimHrsModel} onChange={(e) => setBimHrsModel(Number(e.target.value))} /></div>
          </div>
          <div className='grid md:grid-cols-3 gap-3'>
            <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>Subtotal</div><div className='text-lg font-semibold'>{currency(subtotalHrs)}</div></div>
            <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>VAT ({vatPct}%)</div><div className='text-lg font-semibold'>{currency(vatHrs)}</div></div>
            <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>Total</div><div className='text-lg font-semibold'>{currency(totalHrs)}</div></div>
          </div>
        </div>
      )}
      <div className='flex items-center justify-end text-sm gap-2'>
        <button className='px-3 py-2 bg-zinc-100 text-zinc-900 rounded-xl transition-colors duration-150 hover:bg-zinc-200' onClick={handleExportExcel}>Export Excel</button>
        <button className='px-3 py-2 bg-emerald-500 text-white rounded-xl transition-colors duration-150 hover:bg-emerald-600' onClick={handleExportPdf}>Export PDF</button>
      </div>
    </section>
  );
}
