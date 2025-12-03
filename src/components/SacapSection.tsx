import React, { useMemo } from 'react';
import type { SacapStage, SacapComplexity } from '../types';
import { useLocalStorageNumber, useLocalStorageState, useLocalStorageString } from '../hooks/useLocalStorage';
import { currency, currencyPlain } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages } from '../services/pdfService';
import { createPdfDoc, drawHeading, drawKeyValue, drawTableRows, drawTextInColumn, finishDoc, CONTENT_WIDTH, MARGIN_LEFT } from '../services/pdfLayout';
import { AECOM_RATES, defaultRate, ARC_LOW, ARC_MED, ARC_HIGH, BRAND_COLORS } from '../constants';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from './ui/table';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { Download, Plus, Trash2 } from 'lucide-react';

interface SacapSectionProps {
  globalVow: number;
  vatPct: number;
}

interface UnitType {
  id: string;
  name: string;
  vow: number;
  complexity: SacapComplexity;
  numPrototypes: number;
  numRepeats: number;
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

  const [calculationMode, setCalculationMode] = useLocalStorageString('sacapMode', 'simple') as ['simple' | 'advanced', (v: 'simple' | 'advanced') => void];
  const [vow, setVow] = useLocalStorageNumber('sacapVow', globalVow);
  const [complexity, setComplexity] = useLocalStorageString('sacapComplexity', 'low') as [SacapComplexity, (v: SacapComplexity) => void];
  const [unitTypes, setUnitTypes] = useLocalStorageState<UnitType[]>('sacapUnits', [{ id: '1', name: 'Unit Type A', vow: 1000000, complexity: 'low', numPrototypes: 1, numRepeats: 0 }]);

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

  const calculateFee = (val: number, comp: SacapComplexity) => {
    const table = comp === 'low' ? ARC_LOW : comp === 'medium' ? ARC_MED : ARC_HIGH;
    for (const b of table) { if (val <= b.to) return b.primary + Math.max(0, val - b.over) * b.rate; }
    return 0;
  };

  const baseFee = useMemo(() => {
    if (calculationMode === 'simple') {
      return calculateFee(vow, complexity);
    } else {
      return unitTypes.reduce((acc, unit) => {
        const unitBaseFee = calculateFee(unit.vow, unit.complexity);
        const protoFee = unitBaseFee * unit.numPrototypes;
        const repeatFee = (unitBaseFee * 0.35) * unit.numRepeats;
        return acc + protoFee + repeatFee;
      }, 0);
    }
  }, [vow, complexity, calculationMode, unitTypes]);

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

  const addUnitType = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setUnitTypes(prev => [...prev, { id: newId, name: 'New Unit Type', vow: 1000000, complexity: 'low', numPrototypes: 1, numRepeats: 0 }]);
  };

  const removeUnitType = (id: string) => {
    setUnitTypes(prev => prev.filter(u => u.id !== id));
  };

  const updateUnitType = (id: string, updates: Partial<UnitType>) => {
    setUnitTypes(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  };

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
    if (calculationMode === 'simple') {
      excelRows.push(['Summary', 'Value of Works', '', '', currencyPlain(vow)]);
    } else {
      excelRows.push(['Summary', 'Calculation Mode', 'Advanced (Prototypes & Repeats)', '', '']);
    }
    excelRows.push(['Summary', 'Base Fee', '', '', currencyPlain(baseFee)]);
    excelRows.push(['Summary', 'Total discount amount', '', '', currencyPlain(totalDiscountAmount)]);
    excelRows.push(['Summary', 'TOTAL (ex VAT)', '', '', currencyPlain(subtotal)]);
    excelRows.push(['Summary', `VAT (${vatPct}%)`, '', '', currencyPlain(vat)]);
    excelRows.push(['Summary', 'TOTAL (inc VAT)', '', '', currencyPlain(total)]);
    excelRows.push(['Summary', 'Overall discount (%)', `${overallDiscountPct}%`, '', '']);
    exportExcelTable('sacap.xls', headers, excelRows, { intro: { headers: ['Project Detail', 'Value'], rows: projectDetailRows } });
  };

  const handleExportPdf = () => {
    const doc = createPdfDoc();
    const { columns } = doc;
    drawHeading(doc, 'Fee Proposal');
    drawHeading(doc, 'SACAP Fee Generator', 12, BRAND_COLORS.accent);
    projectDetailRows.forEach(([label, value]) => drawKeyValue(doc, label, value, { size: 11, lineHeight: 15 }));
    doc.cursorY -= 6;

    const infoRows: { label: string; value: string }[] = [
      { label: 'Mode', value: calculationMode === 'simple' ? 'Simple' : 'Advanced (Prototypes & Repeats)' },
      { label: 'Base Fee', value: currencyPlain(baseFee) },
      { label: 'Overall Discount', value: `${overallDiscountPct}%` },
    ];
    if (calculationMode === 'simple') {
      infoRows.unshift({ label: 'Value of Works', value: currencyPlain(vow) });
    }
    infoRows.forEach((r) => drawKeyValue(doc, r.label, r.value, { size: 11, lineHeight: 15 }));
    doc.cursorY -= 6;

    drawHeading(doc, 'Fee Apportionment Summary', 12, BRAND_COLORS.slate);

    const stageCols = [
      columns.label,
      { x: MARGIN_LEFT + CONTENT_WIDTH * 0.45 + 8, width: CONTENT_WIDTH * 0.12, align: 'left' as const },
      { x: MARGIN_LEFT + CONTENT_WIDTH * 0.57 + 10, width: CONTENT_WIDTH * 0.12, align: 'left' as const },
      { x: MARGIN_LEFT + CONTENT_WIDTH * 0.69 + 12, width: CONTENT_WIDTH * 0.14, align: 'left' as const },
      { x: MARGIN_LEFT + CONTENT_WIDTH * 0.83 + 14, width: CONTENT_WIDTH * 0.17 - 14, align: 'right' as const },
    ];

    drawTableRows(
      doc,
      [
        [
          { text: 'Stage', column: stageCols[0], size: 11, color: BRAND_COLORS.light },
          { text: '% of Base', column: stageCols[1], size: 11, color: BRAND_COLORS.light },
          { text: 'Discount %', column: stageCols[2], size: 11, color: BRAND_COLORS.light },
          { text: 'Override', column: stageCols[3], size: 11, color: BRAND_COLORS.light },
          { text: 'Amount', column: stageCols[4], size: 11, color: BRAND_COLORS.light },
        ],
      ],
      16,
    );

    const rows = enabledRows.map((r) => [
      { text: r.name, column: stageCols[0] },
      { text: `${r.pct}%`, column: stageCols[1] },
      { text: `${r.discountPct || 0}%`, column: stageCols[2] },
      { text: currencyPlain(r.override), column: stageCols[3] },
      { text: currencyPlain(r.amount), column: stageCols[4] },
    ]);
    drawTableRows(doc, rows, 16);
    doc.cursorY -= 8;

    const totals = [
      { label: 'Total Discount Amount', value: currencyPlain(totalDiscountAmount) },
      { label: 'Subtotal (ex VAT)', value: currencyPlain(subtotal) },
      { label: `VAT (${vatPct}%)`, value: currencyPlain(vat) },
      { label: 'TOTAL (inc VAT)', value: currencyPlain(total) },
    ];
    totals.forEach((row, idx) => {
      drawTextInColumn(doc, row.label, columns.label, { size: 11, lineHeight: 16, color: BRAND_COLORS.slate });
      drawTextInColumn(doc, row.value, columns.value, { size: 11, lineHeight: 16, color: BRAND_COLORS.charcoal });
      if (idx !== totals.length - 1) doc.cursorY -= 2;
    });

    saveBlob('sacap_summary.pdf', createSimplePdfFromPages(finishDoc(doc)));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>SACAP Fee Generator</CardTitle>
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
        <div className="flex items-center space-x-4 mb-4">
          <Label>Calculation Mode:</Label>
          <div className="flex bg-muted rounded-md p-1">
            <button
              className={cn("px-3 py-1 text-sm rounded-sm transition-all", calculationMode === 'simple' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setCalculationMode('simple')}
            >
              Simple
            </button>
            <button
              className={cn("px-3 py-1 text-sm rounded-sm transition-all", calculationMode === 'advanced' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setCalculationMode('advanced')}
            >
              Prototypes & Repeats
            </button>
          </div>
        </div>

        {calculationMode === 'simple' ? (
          <div className='grid md:grid-cols-3 gap-6'>
            <div className="space-y-2">
              <Label>Value of Works (ZAR)</Label>
              <Input type='number' min={0} value={vow} onChange={(e) => setVow(Number(e.target.value))} />
              <div className='text-xs text-muted-foreground'>Default from Basket: {currency(globalVow)}</div>
            </div>
            <div className="space-y-2">
              <Label>Complexity</Label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
                value={complexity}
                onChange={(e) => setComplexity(e.target.value as SacapComplexity)}
              >
                <option value='low'>Low</option><option value='medium'>Medium</option><option value='high'>High</option>
              </select>
              <div className='text-xs text-muted-foreground'>Base fee (auto): {currency(baseFee)}</div>
            </div>
            <div className="space-y-2">
              <div className='flex items-center justify-between'>
                <Label>Overall discount (%)</Label>
                <span className='text-xs text-muted-foreground'>{overallDiscountPct.toFixed(0)}%</span>
              </div>
              <Input
                type='number'
                min={0}
                max={100}
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
                className='w-full accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer'
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit Type Name</TableHead>
                    <TableHead>Value of Works (per unit)</TableHead>
                    <TableHead>Complexity</TableHead>
                    <TableHead># Prototypes</TableHead>
                    <TableHead># Repeats</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitTypes.map((unit) => {
                    const unitBase = calculateFee(unit.vow, unit.complexity);
                    const subtotal = (unitBase * unit.numPrototypes) + (unitBase * 0.35 * unit.numRepeats);
                    return (
                      <TableRow key={unit.id}>
                        <TableCell>
                          <Input value={unit.name} onChange={(e) => updateUnitType(unit.id, { name: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} value={unit.vow} onChange={(e) => updateUnitType(unit.id, { vow: Number(e.target.value) })} />
                        </TableCell>
                        <TableCell>
                          <select
                            className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
                            value={unit.complexity}
                            onChange={(e) => updateUnitType(unit.id, { complexity: e.target.value as SacapComplexity })}
                          >
                            <option value='low'>Low</option><option value='medium'>Medium</option><option value='high'>High</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={1} value={unit.numPrototypes} onChange={(e) => updateUnitType(unit.id, { numPrototypes: Number(e.target.value) })} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} value={unit.numRepeats} onChange={(e) => updateUnitType(unit.id, { numRepeats: Number(e.target.value) })} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {currency(subtotal)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeUnitType(unit.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center">
              <Button onClick={addUnitType} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Unit Type
              </Button>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Base Fee</div>
                <div className="text-xl font-bold text-primary">{currency(baseFee)}</div>
              </div>
            </div>
            <div className="space-y-2 max-w-md ml-auto">
              <div className='flex items-center justify-between'>
                <Label>Overall discount (%)</Label>
                <span className='text-xs text-muted-foreground'>{overallDiscountPct.toFixed(0)}%</span>
              </div>
              <Input
                type='number'
                min={0}
                max={100}
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
                className='w-full accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer'
              />
            </div>
          </div>
        )}

        <div className='bg-muted/50 border rounded-lg p-4 space-y-4'>
          <div className='flex items-center justify-between gap-3 flex-wrap'>
            <div>
              <div className='text-sm font-medium'>AECOM Value of Works helper</div>
              <div className='text-xs text-muted-foreground'>Select a building type and area to estimate the VOW.</div>
            </div>
            <Button
              variant={aecomEstimate > 0 ? "default" : "secondary"}
              disabled={aecomEstimate <= 0}
              onClick={() => {
                if (aecomEstimate > 0) {
                  if (calculationMode === 'simple') {
                    setVow(aecomEstimate);
                  } else {
                    // In advanced mode, maybe add a new unit type with this VOW?
                    // For now, let's just copy it to clipboard or alert, or maybe add a new unit.
                    // Let's add a new unit type.
                    const newId = Math.random().toString(36).substr(2, 9);
                    setUnitTypes(prev => [...prev, { id: newId, name: selectedAecom?.label || 'New Unit', vow: aecomEstimate, complexity: 'medium', numPrototypes: 1, numRepeats: 0 }]);
                  }
                }
              }}
            >
              {calculationMode === 'simple' ? `Use estimate (${currency(aecomEstimate)})` : `Add as Unit Type (${currency(aecomEstimate)})`}
            </Button>
          </div>
          <div className='grid md:grid-cols-4 gap-4'>
            <div className='md:col-span-2 space-y-2'>
              <Label>Building type</Label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
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
            <div className="space-y-2">
              <Label>Size (m²)</Label>
              <Input
                type='number'
                min={0}
                step={10}
                value={aecomSize}
                onChange={(e) => setAecomSize(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate selection</Label>
              <div className='flex gap-1'>
                {(['min', 'mid', 'max'] as const).map((choice) => (
                  <Button
                    key={choice}
                    type='button'
                    variant={aecomRateChoice === choice ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-xs px-2"
                    onClick={() => setAecomRateChoice(choice)}
                  >
                    {choice === 'mid' ? 'Mid' : choice === 'min' ? 'Min' : 'Max'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className='text-xs text-muted-foreground flex flex-wrap gap-3'>
            {selectedAecom && (
              <>
                <span>Range: {currency(selectedAecom.min)} – {currency(selectedAecom.max)} per m²</span>
                <span>Using: {currency(aecomRate)} per m²</span>
              </>
            )}
            <span>Estimated VOW: {currency(aecomEstimate)}</span>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>% of base</TableHead>
                <TableHead>Discount %</TableHead>
                <TableHead>Override (ZAR)</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={r.enabled}
                        onCheckedChange={(checked) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, enabled: !!checked } : x))}
                      />
                      <span>{r.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type='number'
                      min={0}
                      className="h-8 w-20"
                      value={r.pct}
                      onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, pct: Number(e.target.value) } : x))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type='number'
                      min={0}
                      max={100}
                      className="h-8 w-24"
                      value={r.discountPct || ''}
                      onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, discountPct: Number(e.target.value) } : x))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type='number'
                      min={0}
                      className="h-8 w-28"
                      value={r.override}
                      onChange={(e) => setStages(cur => cur.map((x, i) => i === idx ? { ...x, override: Number(e.target.value) } : x))}
                    />
                  </TableCell>
                  <TableCell className={!r.enabled ? 'text-muted-foreground' : ''}>
                    {currency(r.enabled ? r.amount : 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium text-primary">Total discount amount</TableCell>
                <TableCell>{currency(totalDiscountAmount)}</TableCell>
              </TableRow>
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
  )
}
