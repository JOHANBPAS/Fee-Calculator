import React, { useMemo } from 'react';
import type { ResultKey, SacapComplexity, PdfRun } from '../types';
import { useLocalStorageNumber, useLocalStorageState } from '../hooks/useLocalStorage';
import { currency, currencyPlain, pctFmt } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages, SIMPLE_PDF_PAGE } from '../services/pdfService';
import { calculateFee } from '../services/feeService';
import { RESULT_ROWS } from '../constants';
import { Tooltip } from './Tooltip';

interface ManualRow {
  id: string;
  name: string;
  amount: number;
  enabled: boolean;
}

interface BasketSectionProps {
  globalVow: number;
  onVowChange: (vow: number) => void;
  vatPct: number;
  clientName: string;
}

// Helper component for the Target % input and logic
function TargetControl({ totalBase, globalVow, targetPct, onTargetChange, onApply }: { totalBase: number; globalVow: number; targetPct: number; onTargetChange: (pct: number) => void; onApply: (pct: number) => void; }) {
  const pct = Math.max(0, Math.min(100, targetPct || 0));
  const targetAmount = globalVow * (pct / 100);
  const factorNeeded = totalBase > 0 && targetAmount > 0 ? Math.min(1, Math.max(0, targetAmount / totalBase)) : 1;
  const discountNeeded = Math.max(0, (1 - factorNeeded) * 100);
  
  return (
    <div className='flex gap-2 items-center'>
      <input type='number' min={0} max={100} step={0.1} className='w-full bg-zinc-800 rounded-xl p-2' placeholder='e.g. 12' value={targetPct} onChange={(e) => onTargetChange(Number(e.target.value))} />
      <button className='px-3 py-2 bg-zinc-700 rounded-xl transition-colors duration-150 hover:bg-zinc-600' onClick={() => onApply(Number(discountNeeded.toFixed(2)))} disabled={pct <= 0 || !totalBase} title='Set discount to reach target'>
        Apply
      </button>
      <Tooltip text={`Calculates the global discount % needed to make the total proposed fee equal to ${pct}% of the Value of Works.`}>
          <div className='text-xs text-zinc-400 cursor-help'>Needed: {discountNeeded.toFixed(2)}%</div>
      </Tooltip>
    </div>
  );
}


export function BasketSection({ globalVow, onVowChange, vatPct, clientName }: BasketSectionProps) {
  const [discountPct, setDiscountPct] = useLocalStorageNumber('basketDiscountPct', 0);
  const [basketTargetPct, setBasketTargetPct] = useLocalStorageNumber('basketTargetPct', 0);
  
  const [selectedRows, setSelectedRows] = useLocalStorageState<ResultKey[]>('basketSelectedRows', ['project_manager', 'architect', 'quantity_surveyor', 'engineer_structural']);
  // FIX: Use Partial<Record<...>> to allow an empty object as the initial state, since not all keys will be present.
  const [vowOverride, setVowOverride] = useLocalStorageState<Partial<Record<ResultKey, number>>>('basketVowOverride', {});
  // FIX: Use Partial<Record<...>> to allow an empty object as the initial state, since not all keys will be present.
  const [arcComplexity, setArcComplexity] = useLocalStorageState<Partial<Record<ResultKey, SacapComplexity>>>('basketArcComplexity', {});
  const [manualRows, setManualRows] = useLocalStorageState<ManualRow[]>('basketManualRows', []);
  const [effectivePctOverride, setEffectivePctOverride] = useLocalStorageState<Record<string, number>>('basketEffectivePctOverride', {});

  const calculationResults = useMemo(() => {
    const allRows = [
      ...RESULT_ROWS.map(def => {
        const vow = vowOverride[def.key] || globalVow;
        const baseFee = calculateFee(def.key, vow, arcComplexity[def.key]);
        return { ...def, isManual: false, id: def.key, vow, baseFee, enabled: selectedRows.includes(def.key), name: def.label };
      }),
      ...manualRows.map(m => ({ ...m, key: m.id, isManual: true, vow: 0, baseFee: m.amount, label: m.name, group: 'professional' as const }))
    ];

    const targetAmount = globalVow * (basketTargetPct / 100);
    const hasTarget = basketTargetPct > 0 && globalVow > 0;

    let proposedFees: Record<string, number> = {};
    
    if (hasTarget) {
      const pinnedRows = allRows.filter(r => r.enabled && effectivePctOverride[r.id] != null);
      const unpinnedRows = allRows.filter(r => r.enabled && effectivePctOverride[r.id] == null);
      
      let pinnedTotal = 0;
      pinnedRows.forEach(r => {
        const fee = globalVow * (effectivePctOverride[r.id]! / 100);
        proposedFees[r.id] = fee;
        pinnedTotal += fee;
      });

      const remainingTarget = targetAmount - pinnedTotal;
      const unpinnedBaseTotal = unpinnedRows.reduce((sum, r) => sum + r.baseFee, 0);

      if (unpinnedBaseTotal > 0) {
        const factor = remainingTarget > 0 ? remainingTarget / unpinnedBaseTotal : 0;
        unpinnedRows.forEach(r => {
          proposedFees[r.id] = r.baseFee * factor;
        });
      } else if (unpinnedRows.length > 0) {
        const perRowAmount = remainingTarget / unpinnedRows.length;
        unpinnedRows.forEach(r => {
          proposedFees[r.id] = perRowAmount;
        });
      }

    } else {
      const discountFactor = 1 - (discountPct / 100);
      allRows.forEach(r => {
        proposedFees[r.id] = r.baseFee * discountFactor;
      });
    }

    const finalRows = allRows.map(r => {
      const proposedFee = r.enabled ? (proposedFees[r.id] ?? 0) : 0;
      const effectivePct = globalVow > 0 ? (proposedFee / globalVow) * 100 : 0;
      return { ...r, proposedFee, effectivePct, isPinned: effectivePctOverride[r.id] != null };
    });

    const subtotal = finalRows.reduce((sum, r) => sum + (r.enabled ? r.proposedFee : 0), 0);
    const totalBaseFee = finalRows.reduce((sum, r) => sum + (r.enabled ? r.baseFee : 0), 0);

    return { rows: finalRows, subtotal, totalBaseFee };

  }, [globalVow, basketTargetPct, discountPct, selectedRows, vowOverride, arcComplexity, manualRows, effectivePctOverride]);

  const { rows: processedRows, subtotal, totalBaseFee } = calculationResults;
  const vat = subtotal * (vatPct / 100);
  const total = subtotal + vat;

  const updateEffectivePct = (key: string, value: string) => {
    setEffectivePctOverride(cur => {
      const next = { ...cur };
      if (value === '') {
        delete next[key];
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) next[key] = num;
      }
      return next;
    });
  };

  const handleExportExcel = () => {
    const headers = ['Category', 'Professional', 'VOW Override (ZAR)', 'Effective % of VOW', 'Base Fee (ZAR)', 'Proposed Fee (ZAR)'];
    const excelRows: string[][] = [];
    
    const addRow = (cat: string, r: (typeof processedRows)[0]) => {
      excelRows.push([
          cat,
          r.label,
          r.isManual ? 'N/A' : currencyPlain(r.vow),
          pctFmt(r.effectivePct),
          currencyPlain(r.baseFee),
          currencyPlain(r.proposedFee)
      ]);
    }

    excelRows.push(['Management Consultants']);
    processedRows.filter(r => r.group === 'management' && r.enabled && !r.isManual).forEach(r => addRow('Management', r));
    excelRows.push([]);
    excelRows.push(['Professionals']);
    processedRows.filter(r => r.group === 'professional' && r.enabled && !r.isManual).forEach(r => addRow('Professional', r));
    excelRows.push([]);
    excelRows.push(['Non-Core Consultants']);
    processedRows.filter(r => r.isManual && r.enabled).forEach(r => addRow('Non-Core', r));
    excelRows.push([]);

    excelRows.push(['Summary', 'Global Value of Works', '', '', '', currencyPlain(globalVow)]);
    excelRows.push(['Summary', 'Total Base Fees', '', '', currencyPlain(totalBaseFee)]);
    excelRows.push(['Summary', 'TOTAL (ex VAT)', '', '', '', currencyPlain(subtotal)]);
    excelRows.push(['Summary', `VAT (${vatPct}%)`, '', '', '', currencyPlain(vat)]);
    excelRows.push(['Summary', 'TOTAL (inc VAT)', '', '', '', currencyPlain(total)]);
    exportExcelTable('basket_of_fees.xls', headers, excelRows);
  };
  
  const handleExportPdf = () => {
    const pages: PdfRun[][] = [];
    let cur: PdfRun[] = [];
    let y = SIMPLE_PDF_PAGE.height - 40;
    
    const line = (txt: string, x: number, y: number, size = 10, bold = false): PdfRun => ({ text: txt, x, y, size, font: bold ? 'bold' : 'regular' });
    const checkBreak = () => { if (y < 40) { pages.push(cur); cur = []; y = SIMPLE_PDF_PAGE.height - 40; }};
    
    cur.push(line(`Basket of Fees - ${clientName || 'Untitled'}`, 40, y, 14, true)); y -= 20;
    cur.push(line(`Global Value of Works: ${currencyPlain(globalVow)}`, 40, y, 10)); y -= 20;

    const colX = [40, 240, 320, 400, 480];
    const addRow = (cols: string[], isHeader = false, isBold = false) => {
        checkBreak();
        cols.forEach((text, i) => cur.push(line(text, colX[i], y, isHeader ? 9 : 10, isHeader || isBold)));
        y -= (isHeader ? 12 : 15);
    };

    addRow(['Professional', 'VOW Override', 'Effective %', 'Base Fee', 'Proposed Fee'], true);
    y -= 2;

    const renderGroup = (groupName: string, groupKey: 'management' | 'professional', isManual = false) => {
        const groupRows = processedRows.filter(r => r.enabled && r.group === groupKey && r.isManual === isManual);
        if (groupRows.length === 0) return;
        y -= 5;
        cur.push(line(groupName, 40, y, 11, true)); y -= 18;
        groupRows.forEach(r => {
            addRow([r.label, r.isManual ? 'N/A' : currencyPlain(vowOverride[r.key as ResultKey] || 0), pctFmt(r.effectivePct), currencyPlain(r.baseFee), currencyPlain(r.proposedFee)]);
        });
    };

    renderGroup('Management Consultants', 'management');
    renderGroup('Professionals', 'professional');
    renderGroup('Non-Core Consultants', 'professional', true);

    y -= 10;
    addRow(['Subtotal (ex VAT)', '', '', '', currencyPlain(subtotal)], false, true);
    addRow([`VAT (${vatPct}%)`, '', '', '', currencyPlain(vat)]);
    addRow(['TOTAL (inc VAT)', '', '', '', currencyPlain(total)], false, true);
    
    pages.push(cur);
    saveBlob('basket_of_fees.pdf', createSimplePdfFromPages(pages));
  };

  return (
    <section className='p-3 bg-zinc-900 rounded-2xl shadow space-y-4'>
       <div className='flex items-center justify-between'>
        <h2 className='text-lg font-medium'>Basket of Fees</h2>
        <div className='flex items-center gap-2'>
            <button className='px-3 py-2 bg-zinc-100 text-zinc-900 rounded-xl text-sm transition-colors duration-150 hover:bg-zinc-200' onClick={handleExportExcel}>Export Excel</button>
            <button className='px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm transition-colors duration-150 hover:bg-emerald-600' onClick={handleExportPdf}>Export PDF</button>
        </div>
      </div>
      <div className='grid md:grid-cols-2 gap-3'>
        <div>
          <div className='text-sm mb-1'>Global Value of Works (ZAR)</div>
          <input type='number' min={0} step={100000} className='w-full bg-zinc-800 rounded-xl p-2' value={globalVow} onChange={(e) => onVowChange(Number(e.target.value))} />
        </div>
        <div>
            <div className='text-sm mb-1'>Discount %</div>
            <input type='number' min={0} max={100} step={0.5} className='w-full bg-zinc-800 rounded-xl p-2' value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
        </div>
        <div className='md:col-span-2'>
            <div className='text-sm mb-1'>Basket Target % (of VOW)</div>
            <TargetControl totalBase={totalBaseFee} globalVow={globalVow} targetPct={basketTargetPct} onTargetChange={setBasketTargetPct} onApply={(pct) => { setDiscountPct(pct); setEffectivePctOverride({}); }} />
        </div>
      </div>
      <div className='overflow-x-auto rounded-xl ring-1 ring-white/5'>
        <table className='w-full text-sm'>
            <thead>
                <tr className='bg-white/5 text-left'>
                    <th className='p-2'>Professional</th>
                    <th className='p-2'>VOW Override</th>
                    <th className='p-2'>Effective % of VOW</th>
                    <th className='p-2'>Base Fee</th>
                    <th className='p-2'>Proposed Fee</th>
                </tr>
            </thead>
            <tbody>
                {['management', 'professional'].map(group => (
                    <React.Fragment key={group}>
                        <tr className='bg-zinc-800/50'><td colSpan={5} className='p-2 font-medium text-amber-300'>{group.charAt(0).toUpperCase() + group.slice(1)}</td></tr>
                        {processedRows.filter(r => r.group === group && !r.isManual).map(r => {
                            const isChecked = selectedRows.includes(r.key as ResultKey);
                            return(
                            <tr key={r.key} className={`border-t border-zinc-800 ${!isChecked ? 'opacity-50' : ''}`}>
                                <td className='py-2 px-2'><label className='flex items-center gap-2'><input type='checkbox' checked={isChecked} onChange={e => setSelectedRows(cur => e.target.checked ? [...cur, r.key as ResultKey] : cur.filter(k => k !== r.key))} /><span>{r.label}</span></label></td>
                                <td className='py-2'><input type='number' min={0} className='w-32 bg-zinc-800 rounded-xl p-2' value={vowOverride[r.key as ResultKey] || ''} placeholder={globalVow.toString()} onChange={e => setVowOverride(cur => ({...cur, [r.key]: Number(e.target.value)}))} /></td>
                                <td className='py-2'>
                                    <div className='relative'>
                                        <input type='number' min={0} max={100} step={0.01} className={`w-24 bg-zinc-800 rounded-xl p-2 ${r.isPinned ? 'ring-2 ring-blue-500' : ''}`} value={effectivePctOverride[r.key] ?? ''} placeholder={r.effectivePct.toFixed(2)} onChange={e => updateEffectivePct(r.key, e.target.value)} />
                                        {r.isPinned && <button onClick={() => updateEffectivePct(r.key, '')} className='absolute right-1 top-1/2 -translate-y-1/2 text-xs bg-zinc-700 w-5 h-5 rounded-full'>x</button>}
                                    </div>
                                </td>
                                <td className='py-2'>{currency(r.baseFee)}</td>
                                <td className='py-2 font-semibold'>{currency(r.proposedFee)}</td>
                            </tr>
                        )})}
                    </React.Fragment>
                ))}

                 <tr className='bg-zinc-800/50'><td colSpan={5} className='p-2 font-medium text-amber-300 flex items-center justify-between'><span>Non-core consultants</span><button className='px-2 py-1 text-xs bg-zinc-700 rounded-lg hover:bg-zinc-600' onClick={() => setManualRows(cur => [...cur, { id: Math.random().toString(36).slice(2), name: '', amount: 0, enabled: true }])}>Add Row</button></td></tr>
                 {processedRows.filter(r => r.isManual).map((r, idx) => (
                    <tr key={r.id} className={`border-t border-zinc-800 ${!r.enabled ? 'opacity-50' : ''}`}>
                        <td className='py-2 px-2'>
                            <div className='flex items-center gap-2'>
                                <input type='checkbox' checked={r.enabled} onChange={e => setManualRows(cur => cur.map(m => m.id === r.id ? {...m, enabled: e.target.checked} : m))} />
                                <input className='bg-zinc-800 rounded-xl p-2' placeholder='Consultant Name' value={r.name} onChange={e => setManualRows(cur => cur.map(m => m.id === r.id ? {...m, name: e.target.value} : m))} />
                                <button onClick={() => setManualRows(cur => cur.filter(m => m.id !== r.id))} className='text-xs bg-zinc-700 px-2 py-1 rounded'>Remove</button>
                            </div>
                        </td>
                        <td className='py-2'>N/A</td>
                        <td className='py-2'>
                            <div className='relative'>
                                <input type='number' min={0} max={100} step={0.01} className={`w-24 bg-zinc-800 rounded-xl p-2 ${r.isPinned ? 'ring-2 ring-blue-500' : ''}`} value={effectivePctOverride[r.id] ?? ''} placeholder={r.effectivePct.toFixed(2)} onChange={e => updateEffectivePct(r.id, e.target.value)} />
                                {r.isPinned && <button onClick={() => updateEffectivePct(r.id, '')} className='absolute right-1 top-1/2 -translate-y-1/2 text-xs bg-zinc-700 w-5 h-5 rounded-full'>x</button>}
                            </div>
                        </td>
                        <td className='py-2'><input type='number' min={0} className='w-32 bg-zinc-800 rounded-xl p-2' value={(r as unknown as ManualRow).amount} onChange={e => setManualRows(cur => cur.map(m => m.id === r.id ? {...m, amount: Number(e.target.value)} : m))} /></td>
                        <td className='py-2 font-semibold'>{currency(r.proposedFee)}</td>
                    </tr>
                 ))}
            </tbody>
            <tfoot>
                <tr className='border-t-2 border-white/10 font-semibold'>
                    <td className='p-2 text-right' colSpan={4}>TOTAL (ex VAT)</td>
                    <td className='p-2'>{currency(subtotal)}</td>
                </tr>
                 <tr className='border-t border-zinc-800'>
                    <td className='p-2 text-right' colSpan={4}>VAT ({vatPct}%)</td>
                    <td className='p-2'>{currency(vat)}</td>
                </tr>
                 <tr className='border-t border-zinc-800 font-semibold text-lg'>
                    <td className='p-2 text-right' colSpan={4}>TOTAL (inc VAT)</td>
                    <td className='p-2'>{currency(total)}</td>
                </tr>
            </tfoot>
        </table>
      </div>
    </section>
  );
}