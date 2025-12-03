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
import { Download } from 'lucide-react';

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
    const doc = createPdfDoc();
    const { columns } = doc;
    drawHeading(doc, 'Fee Proposal');
    drawHeading(doc, 'SACAP Fee Generator', 12, BRAND_COLORS.accent);
    projectDetailRows.forEach(([label, value]) => drawKeyValue(doc, label, value, { size: 11, lineHeight: 15 }));
    doc.cursorY -= 6;

    const infoRows: { label: string; value: string }[] = [
      { label: 'Value of Works', value: currencyPlain(vow) },
      { label: 'Base Fee', value: currencyPlain(baseFee) },
      { label: 'Overall Discount', value: `${overallDiscountPct}%` },
    ];
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

        <div className='bg-muted/50 border rounded-lg p-4 space-y-4'>
          <div className='flex items-center justify-between gap-3 flex-wrap'>
            <div>
              <div className='text-sm font-medium'>AECOM Value of Works helper</div>
              <div className='text-xs text-muted-foreground'>Select a building type and area to estimate the VOW.</div>
            </div>
            <Button
              variant={aecomEstimate > 0 ? "default" : "secondary"}
              disabled={aecomEstimate <= 0}
              onClick={() => { if (aecomEstimate > 0) setVow(aecomEstimate) }}
            >
              Use estimate ({currency(aecomEstimate)})
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
