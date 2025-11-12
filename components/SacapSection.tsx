import React, { useMemo } from 'react';
import type { SacapStage, SacapComplexity, PdfRun } from '../types';
import { useLocalStorageNumber, useLocalStorageState, useLocalStorageString } from '../hooks/useLocalStorage';
import { currency, currencyPlain } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages, SIMPLE_PDF_PAGE } from '../services/pdfService';
import { AECOM_RATES, defaultRate, ARC_LOW, ARC_MED, ARC_HIGH, BRAND_COLORS } from '../constants';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';

interface SacapSectionProps {
  globalVow: number;
  vatPct: number;
}

export function SacapSection({ globalVow, vatPct }: SacapSectionProps) {
  const defaults: SacapStage[] = [
    { name: 'Stage 1: Inception', pct: 2, override: 0, enabled: true, discountPct: 0 },
    { name: 'Stage 2: Concept and Viability', pct: 15, override: 0, enabled: true, discountPct: 0 },
    { name: 'Stage 3: Design Development', pct: 20, override: 0, enabled: true, discountPct: 0 },
    { name: 'Stage 4.1: Documentation and Procurement', pct: 10, override: 0, enabled: true, discountPct: 0 },
    { name: 'Stage 4.2: Documentation and Procurement', pct: 20, override: 0, enabled: true, discountPct: 0 },
    { name: 'Stage 5: Construction', pct: 30, override: 0, enabled: true, discountPct: 0 },
    { name: 'Stage 6: Handover and Close-out', pct: 3, override: 0, enabled: true, discountPct: 0 },
  ];
  const [vow, setVow] = useLocalStorageNumber('sacapVow', globalVow);
  const [complexity, setComplexity] = useLocalStorageString('sacapComplexity', 'low') as [SacapComplexity, (v: SacapComplexity) => void];
  const [stages, setStages] = useLocalStorageState<SacapStage[]>('sacapStages', defaults);
  const [overallDiscountPct, setOverallDiscountPct] = useLocalStorageNumber('sacapOverallDiscountPct', 0);
  const handleOverallDiscountChange = (value: number) => {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(100, Math.max(0, value));
    setOverallDiscountPct(clamped);
  };

  const aecomOptions = useMemo(() => AECOM_RATES.flatMap(g => g.items.filter(i => i.unit === 'm2').map(i => ({ ...i, group: g.group }))), []);
  const [aecomKey, setAecomKey] = useLocalStorageString('sacapAecomKey', aecomOptions[0]?.key || '');
  const [aecomSize, setAecomSize] = useLocalStorageNumber('sacapAecomSize', 1000);
  const [aecomRateChoice, setAecomRateChoice] = useLocalStorageString('sacapAecomRateChoice', 'mid');

  const selectedAecom = aecomOptions.find(item => item.key === aecomKey) ?? aecomOptions[0];
  const aecomRate = selectedAecom ? (aecomRateChoice === 'min' ? selectedAecom.min : aecomRateChoice === 'max' ? selectedAecom.max : defaultRate(selectedAecom)) : 0;
  const aecomEstimate = selectedAecom ? Math.max(0, Math.round(aecomRate * Math.max(0, aecomSize || 0))) : 0;
  const exportedOn = formatExportDate();
  const projectDetails = getProjectDetailsSnapshot({ aecomKey, aecomSize, complexity });
  const projectDetailRows = [...projectDetails.rows, ['Exported On', exportedOn]];

  const baseFee = useMemo(() => {
    const table = complexity === 'low' ? ARC_LOW : complexity === 'medium' ? ARC_MED : ARC_HIGH;
    for (const b of table) { if (vow <= b.to) return b.primary + Math.max(0, vow - b.over) * b.rate; }
    return 0;
  }, [vow, complexity]);

  const overallFactor = Math.max(0, 1 - (overallDiscountPct || 0) / 100);

  const rows = useMemo(() => stages.map(s => {
    const stageFee = baseFee * (s.pct / 100);
    const discountedStageFee = stageFee * Math.max(0, 1 - ((s.discountPct || 0) / 100));
    const preOverallAmount = s.override > 0 ? s.override : discountedStageFee;
    const amount = preOverallAmount * overallFactor;
    return { ...s, amount, stageFee, discountedStageFee, preOverallAmount };
  }), [stages, baseFee, overallFactor]);

  const enabledRows = useMemo(() => rows.filter(r => r.enabled), [rows]);

  const subtotalBeforeOverall = useMemo(() => enabledRows.reduce((a, b) => a + b.preOverallAmount, 0), [enabledRows]);
  const subtotal = useMemo(() => enabledRows.reduce((a, b) => a + b.amount, 0), [enabledRows]);

  const totalDiscountAmount = subtotalBeforeOverall - subtotal;

  const vat = subtotal * (vatPct / 100);
  const total = subtotal + vat;

  const handleExportExcel = () => {
    const headers = ['Stage', '% of base', 'Discount %', 'Override (ZAR)', 'Amount (ZAR)'];
    const excelRows: string[][] = enabledRows.map((r) => [
      r.name,
      `${r.pct}%`,
      `${r.discountPct || 0}%`,
      currencyPlain(r.override),
      currencyPlain(r.amount),
    ]);
    excelRows.push([]); // spacer
    excelRows.push(['Summary', 'Value of Works', '', '', currencyPlain(vow)]);
    excelRows.push(['Summary', 'Base Fee', '', '', currencyPlain(baseFee)]);
    excelRows.push(['Summary', 'Total discount amount', '', '', currencyPlain(totalDiscountAmount)]);
    excelRows.push(['Summary', 'TOTAL (ex VAT)', '', '', currencyPlain(subtotal)]);
    excelRows.push(['Summary', `VAT (${vatPct}%)`, '', '', currencyPlain(vat)]);
    excelRows.push(['Summary', 'TOTAL (inc VAT)', '', '', currencyPlain(total)]);
    excelRows.push(['Summary', 'Overall discount (%)', `${overallDiscountPct}%`, '', '']);
    exportExcelTable('sacap.xls', headers, excelRows, { intro: { headers: ['Project Detail', 'Value'], rows: projectDetailRows } });
  };

  const handleExportPdf = () => {
    const detailRows = [...projectDetailRows];
    const pages: PdfRun[][] = [];
    const brand = BRAND_COLORS;
    const margin = 48;
    const width = SIMPLE_PDF_PAGE.width - margin * 2;
    const tableWidth = width;
    const headerX = margin;
    const colX = [margin, margin + 160, margin + 260, margin + 360, margin + 450];
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
      text('SACAP Fee Generator', margin, y - 44, 12, false, brand.light);
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
        text(val, colX[idx], y, opts?.header ? 9 : 10, opts?.header || opts?.bold, opts?.header ? brand.light : brand.charcoal);
      });
      y -= opts?.header ? 18 : 16;
    };

    const addCards = () => {
      const cards: [string, string][] = [
        ['Value of Works', currencyPlain(vow)],
        ['Base Fee', currencyPlain(baseFee)],
        ['Overall Discount', `${overallDiscountPct}%`],
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

    const addSummary = (label: string, value: string, highlight = false) => {
      const rowHeight = 20;
      checkBreak();
      rect(headerX, y, tableWidth, rowHeight, highlight ? brand.accent : brand.light);
      text(label, margin, y - 6, 10, true, highlight ? brand.charcoal : brand.slate);
      text(value, margin + width - 80, y - 6, 10, true, brand.charcoal);
      y -= rowHeight;
    };

    startPage(true);
    addCards();
    text('Fee Apportionment Summary', margin, y, 12, true, brand.slate);
    y -= 18;
    addRow(['Stage', '% of Base', 'Discount %', 'Override', 'Amount'], { header: true });

    enabledRows.forEach((r) => {
      addRow([
        r.name,
        `${r.pct}%`,
        `${r.discountPct || 0}%`,
        currencyPlain(r.override),
        currencyPlain(r.amount),
      ]);
    });

    y -= 8;
    addSummary('Total Discount Amount', currencyPlain(totalDiscountAmount));
    addSummary('Subtotal (ex VAT)', currencyPlain(subtotal));
    addSummary(`VAT (${vatPct}%)`, currencyPlain(vat));
    addSummary('TOTAL (inc VAT)', currencyPlain(total), true);

    pages.push(cur);
    saveBlob('sacap_summary.pdf', createSimplePdfFromPages(pages));
  };

  return (
    <section className='p-3 bg-zinc-900 rounded-2xl shadow space-y-3'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-medium'>SACAP Fee Generator</h2>
        <div className='flex items-center gap-2'>
          <button className='px-3 py-2 bg-zinc-100 text-zinc-900 rounded-xl text-sm transition-colors duration-150 hover:bg-zinc-200' onClick={handleExportExcel}>Export Excel</button>
          <button className='px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm transition-colors duration-150 hover:bg-emerald-600' onClick={handleExportPdf}>Export PDF</button>
        </div>
      </div>
      <div className='grid md:grid-cols-3 gap-3'>
        <div>
          <div className='text-sm mb-1'>Value of Works (ZAR)</div>
          <input type='number' min={0} className='w-full bg-zinc-800 rounded-xl p-2' value={vow} onChange={(e) => setVow(Number(e.target.value))} />
          <div className='text-xs text-zinc-400 mt-1'>Default from Basket: {currency(globalVow)}</div>
        </div>
        <div>
          <div className='text-sm mb-1'>Complexity</div>
          <select className='w-full bg-zinc-800 rounded-xl p-2' value={complexity} onChange={(e) => setComplexity(e.target.value as SacapComplexity)}>
            <option value='low'>Low</option><option value='medium'>Medium</option><option value='high'>High</option>
          </select>
          <div className='text-xs text-zinc-400 mt-1'>Base fee (auto): {currency(baseFee)}</div>
        </div>
        <div>
          <div className='flex items-center justify-between text-sm mb-1'>
            <span>Overall discount (%)</span>
            <span className='text-xs text-zinc-400'>{overallDiscountPct.toFixed(0)}%</span>
          </div>
          <input
            type='number'
            min={0}
            max={100}
            className='w-full bg-zinc-800 rounded-xl p-2 mb-2'
            value={overallDiscountPct}
            onChange={(e) => handleOverallDiscountChange(Number(e.target.value))}
          />
          <input
            type='range'
            min={0}
            max={100}
            step={1}
            value={overallDiscountPct}
            onChange={(e) => handleOverallDiscountChange(Number(e.target.value))}
            className='w-full accent-amber-400'
          />
        </div>
      </div>

      <div className='bg-zinc-900/60 border border-white/5 rounded-2xl p-3 space-y-3'>
        <div className='flex items-center justify-between gap-3 flex-wrap'>
          <div>
            <div className='text-sm font-medium'>AECOM Value of Works helper</div>
            <div className='text-xs text-zinc-400'>Select a building type and area to estimate the VOW.</div>
          </div>
          <button
            className={`px-3 py-2 rounded-xl transition-colors duration-150 ${aecomEstimate > 0 ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            onClick={() => { if (aecomEstimate > 0) setVow(aecomEstimate) }}
            disabled={aecomEstimate <= 0}
          >
            Use estimate ({currency(aecomEstimate)})
          </button>
        </div>
        <div className='grid md:grid-cols-4 gap-3'>
          <div className='md:col-span-2'>
            <div className='text-xs text-zinc-400 mb-1'>Building type</div>
            <select
              className='w-full bg-zinc-800 rounded-xl p-2'
              value={selectedAecom?.key || ''}
              onChange={(e) => setAecomKey(e.target.value)}
            >
              {AECOM_RATES.map((group) => {
                const items = group.items.filter((item) => item.unit === 'm2')
                if (!items.length) return null
                return (
                  <optgroup key={group.group} label={group.group}>
                    {items.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>
          <div>
            <div className='text-xs text-zinc-400 mb-1'>Size (m²)</div>
            <input
              type='number'
              min={0}
              step={10}
              className='w-full bg-zinc-800 rounded-xl p-2'
              value={aecomSize}
              onChange={(e) => setAecomSize(Number(e.target.value))}
            />
          </div>
          <div>
            <div className='text-xs text-zinc-400 mb-1'>Rate selection</div>
            <div className='flex gap-1'>
              {(['min', 'mid', 'max'] as const).map((choice) => (
                <button
                  key={choice}
                  type='button'
                  className={`flex-1 text-xs px-2 py-1 rounded-lg border transition-colors ${aecomRateChoice === choice ? 'bg-emerald-500/20 border-emerald-500 text-emerald-200' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
                  onClick={() => setAecomRateChoice(choice)}
                >
                  {choice === 'mid' ? 'Mid (avg)' : choice === 'min' ? 'Min' : 'Max'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className='text-xs text-zinc-400 flex flex-wrap gap-3'>
          {selectedAecom && (
            <>
              <span>Range: {currency(selectedAecom.min)} – {currency(selectedAecom.max)} per m²</span>
              <span>Using: {currency(aecomRate)} per m²</span>
            </>
          )}
          <span>Estimated VOW: {currency(aecomEstimate)}</span>
        </div>
      </div>

      <div className='overflow-x-auto rounded-xl ring-1 ring-white/5'>
        <table className='w-full text-sm'>
          <thead><tr className='bg-white/5 text-left'><th className='p-2'>Stage</th><th className='p-2'>% of base</th><th className='p-2'>Discount %</th><th className='p-2'>Override (ZAR)</th><th className='p-2'>Amount</th></tr></thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className='border-t border-zinc-800'>
                <td className='py-2 px-2'><label className='flex items-center gap-2'><input type='checkbox' checked={r.enabled} onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, enabled: e.target.checked } : x))} /><span>{r.name}</span></label></td>
                <td className='py-2'><input type='number' min={0} className='w-20 bg-zinc-800 rounded-xl p-2' value={r.pct} onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, pct: Number(e.target.value) } : x))} /></td>
                <td className='py-2'><input type='number' min={0} max={100} className='w-24 bg-zinc-800 rounded-xl p-2' value={r.discountPct || ''} onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, discountPct: Number(e.target.value) } : x))} /></td>
                <td className='py-2'><input type='number' min={0} className='w-28 bg-zinc-800 rounded-xl p-2' value={r.override} onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, override: Number(e.target.value) } : x))} /></td>
                <td className='py-2'>{currency(r.enabled ? r.amount : 0)}</td>
              </tr>
            ))}
            <tr className='border-t border-zinc-800 font-medium text-amber-300'>
              <td className='py-2 px-2' colSpan={4}>Total discount amount</td>
              <td className='py-2'>{currency(totalDiscountAmount)}</td>
            </tr>
            <tr className='border-t border-zinc-800 font-medium'><td className='py-2 px-2'>TOTAL (ex VAT)</td><td colSpan={3}></td><td className='py-2'>{currency(subtotal)}</td></tr>
            <tr className='border-t border-zinc-800'><td className='py-2 px-2'>VAT ({vatPct}%)</td><td colSpan={3}></td><td className='py-2'>{currency(vat)}</td></tr>
            <tr className='border-t border-zinc-800 font-medium text-lg'><td className='py-2 px-2'>TOTAL (inc VAT)</td><td colSpan={3}></td><td className='py-2'>{currency(total)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
