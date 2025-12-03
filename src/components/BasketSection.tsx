import React, { useMemo } from 'react';
import type { ResultKey, SacapComplexity, PdfRun } from '../types';
import { useLocalStorageNumber, useLocalStorageState } from '../hooks/useLocalStorage';
import { currency, currencyPlain, pctFmt } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages, SIMPLE_PDF_PAGE } from '../services/pdfService';
import { calculateFee } from '../services/feeService';
import { RESULT_ROWS, BRAND_COLORS } from '../constants';
import { Tooltip } from './Tooltip';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { Download, Plus, Trash2, X } from 'lucide-react';

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
      <Input type='number' min={0} max={100} step={0.1} className='w-full' placeholder='e.g. 12' value={targetPct} onChange={(e) => onTargetChange(Number(e.target.value))} />
      <Button variant="secondary" onClick={() => onApply(Number(discountNeeded.toFixed(2)))} disabled={pct <= 0 || !totalBase} title='Set discount to reach target'>
        Apply
      </Button>
      <Tooltip text={`Calculates the global discount % needed to make the total proposed fee equal to ${pct}% of the Value of Works.`}>
        <div className='text-xs text-muted-foreground cursor-help whitespace-nowrap'>Needed: {discountNeeded.toFixed(2)}%</div>
      </Tooltip>
    </div>
  );
}


export function BasketSection({ globalVow, onVowChange, vatPct, clientName }: BasketSectionProps) {
  const [discountPct, setDiscountPct] = useLocalStorageNumber('basketDiscountPct', 0);
  const [basketTargetPct, setBasketTargetPct] = useLocalStorageNumber('basketTargetPct', 0);

  const [selectedRows, setSelectedRows] = useLocalStorageState<ResultKey[]>('basketSelectedRows', ['project_manager', 'architect', 'quantity_surveyor', 'engineer_structural']);
  const [vowOverride, setVowOverride] = useLocalStorageState<Partial<Record<ResultKey, number>>>('basketVowOverride', {});
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
    const projectDetails = getProjectDetailsSnapshot({ clientName });
    const introRows = [...projectDetails.rows, ['Exported On', formatExportDate()]];

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
    exportExcelTable('basket_of_fees.xls', headers, excelRows, { intro: { headers: ['Project Detail', 'Value'], rows: introRows } });
  };

  const handleExportPdf = () => {
    const projectDetails = getProjectDetailsSnapshot({ clientName });
    const detailRows = [...projectDetails.rows, ['Exported On', formatExportDate()]];
    const pages: PdfRun[][] = [];
    const brand = BRAND_COLORS;
    const margin = 48;
    const width = SIMPLE_PDF_PAGE.width - margin * 2;
    const tableWidth = width;
    const headerX = margin;
    const columnX = [margin, margin + 170, margin + 285, margin + 380, margin + 470];
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
      text('Basket of Fees', margin, y - 44, 12, false, brand.light);
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
        y -= 14;
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
      checkBreak(opts?.header ? 80 : 50);
      if (opts?.header) rect(headerX, y + 6, tableWidth, 18, brand.slate);
      cols.forEach((val, idx) => {
        text(val, columnX[idx], y, opts?.header ? 9 : 10, opts?.header || opts?.bold, opts?.header ? brand.light : brand.charcoal);
      });
      y -= opts?.header ? 18 : 16;
    };

    const addSectionTitle = (label: string) => {
      checkBreak();
      y -= 4;
      text(label, margin, y, 11, true, brand.slate);
      y -= 14;
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
    addRow(['Professional', 'VOW Override', 'Effective %', 'Base Fee', 'Proposed Fee'], { header: true });

    const renderGroup = (label: string, groupKey: 'management' | 'professional', isManual = false) => {
      const rows = processedRows.filter(r => r.enabled && r.group === groupKey && r.isManual === isManual);
      if (!rows.length) return;
      addSectionTitle(label);
      rows.forEach(r => {
        addRow([
          r.label,
          r.isManual ? 'N/A' : currencyPlain(vowOverride[r.key as ResultKey] || 0),
          pctFmt(r.effectivePct),
          currencyPlain(r.baseFee),
          currencyPlain(r.proposedFee),
        ]);
      });
    };

    renderGroup('Management Consultants', 'management');
    renderGroup('Professionals', 'professional');
    renderGroup('Non-Core Consultants', 'professional', true);

    y -= 6;
    addSummary('Subtotal (ex VAT)', currencyPlain(subtotal));
    addSummary(`VAT (${vatPct}%)`, currencyPlain(vat));
    addSummary('TOTAL (inc VAT)', currencyPlain(total), true);

    pages.push(cur);
    saveBlob('basket_of_fees.pdf', createSimplePdfFromPages(pages));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Basket of Fees</CardTitle>
        <div className='flex items-center gap-2'>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button variant="default" size="sm" onClick={handleExportPdf}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className='grid md:grid-cols-2 gap-6'>
          <div className="space-y-2">
            <Label>Global Value of Works (ZAR)</Label>
            <Input type='number' min={0} step={100000} value={globalVow} onChange={(e) => onVowChange(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Discount %</Label>
            <Input type='number' min={0} max={100} step={0.5} value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
          </div>
          <div className='md:col-span-2 space-y-2'>
            <Label>Basket Target % (of VOW)</Label>
            <TargetControl totalBase={totalBaseFee} globalVow={globalVow} targetPct={basketTargetPct} onTargetChange={setBasketTargetPct} onApply={(pct) => { setDiscountPct(pct); setEffectivePctOverride({}); }} />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Professional</TableHead>
                <TableHead>VOW Override</TableHead>
                <TableHead>Effective % of VOW</TableHead>
                <TableHead>Base Fee</TableHead>
                <TableHead>Proposed Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {['management', 'professional'].map(group => (
                <React.Fragment key={group}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={5} className="font-medium text-primary">
                      {group.charAt(0).toUpperCase() + group.slice(1)}
                    </TableCell>
                  </TableRow>
                  {processedRows.filter(r => r.group === group && !r.isManual).map(r => {
                    const isChecked = selectedRows.includes(r.key as ResultKey);
                    return (
                      <TableRow key={r.key} className={!isChecked ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`row-${r.key}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => setSelectedRows(cur => checked ? [...cur, r.key as ResultKey] : cur.filter(k => k !== r.key))}
                            />
                            <label
                              htmlFor={`row-${r.key}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {r.label}
                            </label>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type='number'
                            min={0}
                            className="h-8 w-32"
                            value={vowOverride[r.key as ResultKey] || ''}
                            placeholder={globalVow.toString()}
                            onChange={e => setVowOverride(cur => ({ ...cur, [r.key]: Number(e.target.value) }))}
                          />
                        </TableCell>
                        <TableCell>
                          <div className='relative flex items-center'>
                            <Input
                              type='number'
                              min={0}
                              max={100}
                              step={0.01}
                              className={cn("h-8 w-24", r.isPinned && "ring-2 ring-primary")}
                              value={effectivePctOverride[r.key] ?? ''}
                              placeholder={r.effectivePct.toFixed(2)}
                              onChange={e => updateEffectivePct(r.key, e.target.value)}
                            />
                            {r.isPinned && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => updateEffectivePct(r.key, '')}>
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{currency(r.baseFee)}</TableCell>
                        <TableCell className="font-bold">{currency(r.proposedFee)}</TableCell>
                      </TableRow>
                    )
                  })}
                </React.Fragment>
              ))}

              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={5} className="p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-primary">Non-core consultants</span>
                    <Button variant="secondary" size="sm" onClick={() => setManualRows(cur => [...cur, { id: Math.random().toString(36).slice(2), name: '', amount: 0, enabled: true }])}>
                      <Plus className="mr-2 h-3 w-3" />
                      Add Row
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {processedRows.filter(r => r.isManual).map((r, idx) => (
                <TableRow key={r.id} className={!r.enabled ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        checked={r.enabled}
                        onCheckedChange={(checked) => setManualRows(cur => cur.map(m => m.id === r.id ? { ...m, enabled: !!checked } : m))}
                      />
                      <Input
                        className="h-8"
                        placeholder='Consultant Name'
                        value={r.name}
                        onChange={e => setManualRows(cur => cur.map(m => m.id === r.id ? { ...m, name: e.target.value } : m))}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setManualRows(cur => cur.filter(m => m.id !== r.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">N/A</TableCell>
                  <TableCell>
                    <div className='relative flex items-center'>
                      <Input
                        type='number'
                        min={0}
                        max={100}
                        step={0.01}
                        className={cn("h-8 w-24", r.isPinned && "ring-2 ring-primary")}
                        value={effectivePctOverride[r.id] ?? ''}
                        placeholder={r.effectivePct.toFixed(2)}
                        onChange={e => updateEffectivePct(r.id, e.target.value)}
                      />
                      {r.isPinned && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => updateEffectivePct(r.id, '')}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type='number'
                      min={0}
                      className="h-8 w-32"
                      value={(r as unknown as ManualRow).amount}
                      onChange={e => setManualRows(cur => cur.map(m => m.id === r.id ? { ...m, amount: Number(e.target.value) } : m))}
                    />
                  </TableCell>
                  <TableCell className="font-bold">{currency(r.proposedFee)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium">TOTAL (ex VAT)</TableCell>
                <TableCell className="font-bold">{currency(subtotal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium">VAT ({vatPct}%)</TableCell>
                <TableCell className="font-bold">{currency(vat)}</TableCell>
              </TableRow>
              <TableRow className="bg-muted font-bold text-lg">
                <TableCell colSpan={4} className="text-right">TOTAL (inc VAT)</TableCell>
                <TableCell>{currency(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
