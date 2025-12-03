import React, { useEffect } from 'react';
import type { BimMethod, BimPreset } from '../types';
import { useLocalStorageNumber, useLocalStorageState, useLocalStorageString } from '../hooks/useLocalStorage';
import { currency, currencyPlain } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages } from '../services/pdfService';
import { createPdfDoc, drawHeading, drawKeyValue, drawTableRows, drawTextInColumn, finishDoc, CONTENT_WIDTH, MARGIN_LEFT } from '../services/pdfLayout';
import { HOURS_PER_DAY, SCAN_M2_PER_DAY, MODEL_M2_PER_DAY, BIM_PRESETS, HOURLY_BIM_RATE, BRAND_COLORS } from '../constants';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Download } from 'lucide-react';

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
    const doc = createPdfDoc();
    const { columns } = doc;
    const projectDetails = getProjectDetailsSnapshot({ clientName });
    const detailRows = [...projectDetails.rows, ['Exported On', formatExportDate()]];

    drawHeading(doc, 'Fee Proposal');
    drawHeading(doc, 'BIM Fee Summary', 12, BRAND_COLORS.accent);
    detailRows.forEach(([label, value]) => drawKeyValue(doc, label, value, { size: 11, lineHeight: 15 }));
    doc.cursorY -= 8;

    // Intro cards as key/values
    const methodLabel = bimMethod === 'per_m2' ? 'Method: Per m²' : 'Method: Hourly';
    drawKeyValue(doc, methodLabel, bimMethod === 'per_m2' ? `Preset: ${bimPreset}` : `Hourly rate: ${currencyPlain(HOURLY_BIM_RATE)}`);
    if (bimMethod === 'per_m2') {
      drawKeyValue(doc, 'Gross area', `${bimArea.toLocaleString('en-ZA')} m²`);
    } else {
      drawKeyValue(doc, 'Total hours', String(bimHrsScan + bimHrsReg + bimHrsModel));
    }
    doc.cursorY -= 6;

    // Table headers
    const tableCols = bimMethod === 'per_m2'
      ? [
        columns.label,
        { x: MARGIN_LEFT + CONTENT_WIDTH * 0.45 + 8, width: CONTENT_WIDTH * 0.2, align: 'left' as const },
        { x: MARGIN_LEFT + CONTENT_WIDTH * 0.65 + 12, width: CONTENT_WIDTH * 0.15, align: 'left' as const },
        { x: MARGIN_LEFT + CONTENT_WIDTH * 0.8 + 18, width: CONTENT_WIDTH * 0.2 - 18, align: 'right' as const },
      ]
      : [
        columns.label,
        { x: MARGIN_LEFT + CONTENT_WIDTH * 0.45 + 8, width: CONTENT_WIDTH * 0.15, align: 'left' as const },
        { x: MARGIN_LEFT + CONTENT_WIDTH * 0.6 + 12, width: CONTENT_WIDTH * 0.15, align: 'left' as const },
        { x: MARGIN_LEFT + CONTENT_WIDTH * 0.75 + 16, width: CONTENT_WIDTH * 0.25 - 16, align: 'right' as const },
      ];

    drawTableRows(
      doc,
      [
        [
          { text: 'Item', column: tableCols[0], size: 11, color: BRAND_COLORS.light },
          { text: bimMethod === 'per_m2' ? 'Rate' : 'Hours', column: tableCols[1], size: 11, color: BRAND_COLORS.light },
          { text: bimMethod === 'per_m2' ? 'Area' : 'Rate', column: tableCols[2], size: 11, color: BRAND_COLORS.light },
          { text: 'Amount', column: tableCols[3], size: 11, color: BRAND_COLORS.light },
        ],
      ],
      16,
    );

    const rows: Array<Array<{ text: string; column: any; size?: number }>> = [];
    if (bimMethod === 'per_m2') {
      rows.push(
        [
          { text: 'Scanning', column: tableCols[0] },
          { text: currencyPlain(bimRates.scan), column: tableCols[1] },
          { text: `${bimArea.toLocaleString('en-ZA')} m²`, column: tableCols[2] },
          { text: currencyPlain(scanAmount), column: tableCols[3] },
        ],
        [
          { text: 'Registration', column: tableCols[0] },
          { text: currencyPlain(bimRates.reg), column: tableCols[1] },
          { text: `${bimArea.toLocaleString('en-ZA')} m²`, column: tableCols[2] },
          { text: currencyPlain(regAmount), column: tableCols[3] },
        ],
        [
          { text: 'Modelling', column: tableCols[0] },
          { text: currencyPlain(bimRates.model), column: tableCols[1] },
          { text: `${bimArea.toLocaleString('en-ZA')} m²`, column: tableCols[2] },
          { text: currencyPlain(modelAmount), column: tableCols[3] },
        ],
      );
    } else {
      rows.push(
        [
          { text: 'Scanning', column: tableCols[0] },
          { text: String(bimHrsScan), column: tableCols[1] },
          { text: currencyPlain(HOURLY_BIM_RATE), column: tableCols[2] },
          { text: currencyPlain(bimHrsScan * HOURLY_BIM_RATE), column: tableCols[3] },
        ],
        [
          { text: 'Registration', column: tableCols[0] },
          { text: String(bimHrsReg), column: tableCols[1] },
          { text: currencyPlain(HOURLY_BIM_RATE), column: tableCols[2] },
          { text: currencyPlain(bimHrsReg * HOURLY_BIM_RATE), column: tableCols[3] },
        ],
        [
          { text: 'Modelling', column: tableCols[0] },
          { text: String(bimHrsModel), column: tableCols[1] },
          { text: currencyPlain(HOURLY_BIM_RATE), column: tableCols[2] },
          { text: currencyPlain(bimHrsModel * HOURLY_BIM_RATE), column: tableCols[3] },
        ],
      );
    }
    drawTableRows(doc, rows, 16);
    doc.cursorY -= 6;

    const totals = bimMethod === 'per_m2'
      ? [
        { label: 'Subtotal (ex VAT)', value: currencyPlain(subtotalBim) },
        { label: `VAT (${vatPct}%)`, value: currencyPlain(vatBim) },
        { label: 'TOTAL (inc VAT)', value: currencyPlain(totalBim) },
      ]
      : [
        { label: 'Subtotal (ex VAT)', value: currencyPlain(subtotalHrs) },
        { label: `VAT (${vatPct}%)`, value: currencyPlain(vatHrs) },
        { label: 'TOTAL (inc VAT)', value: currencyPlain(totalHrs) },
      ];
    totals.forEach((row) => {
      drawTextInColumn(doc, row.label, columns.label, { size: 11, lineHeight: 16, color: BRAND_COLORS.slate });
      drawTextInColumn(doc, row.value, columns.value, { size: 11, lineHeight: 16, color: BRAND_COLORS.charcoal });
      doc.cursorY -= 2;
    });

    saveBlob('bim_summary.pdf', createSimplePdfFromPages(finishDoc(doc)));
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>BIM Scanning & Modelling</CardTitle>
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
            <Label>Method</Label>
            <select
              value={bimMethod}
              onChange={(e) => setBimMethod(e.target.value as BimMethod)}
              className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
            >
              <option value='per_m2'>Per m2</option>
              <option value='per_hour'>Hourly</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Area (m2)</Label>
            <Input type='number' min={0} step={10} value={bimArea} onChange={(e) => setBimArea(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Preset</Label>
            <select
              className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
              value={bimPreset}
              onChange={(e) => {
                const v = e.target.value as BimPreset;
                setBimPreset(v);
                if (v === 'homes') setBimRates(BIM_PRESETS.homes);
                else if (v === 'large') setBimRates(BIM_PRESETS.large);
              }}
              disabled={bimMethod !== 'per_m2'}
            >
              <option value='auto'>Auto (by area)</option>
              <option value='homes'>Houses (&lt; 500 m2)</option>
              <option value='large'>Large (&gt; 1000 m2)</option>
              <option value='custom'>Custom</option>
            </select>
          </div>
        </div>

        {bimMethod === 'per_m2' ? (
          <div className='bg-muted/50 border rounded-lg p-4 space-y-4'>
            <div className='grid md:grid-cols-3 gap-4'>
              <div className="space-y-2">
                <Label>Rate/m2: Scan</Label>
                <Input type='number' min={0} step={0.01} value={bimRates.scan} onChange={(e) => setBimRates(cur => ({ ...cur, scan: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Rate/m2: Registration</Label>
                <Input type='number' min={0} step={0.01} value={bimRates.reg} onChange={(e) => setBimRates(cur => ({ ...cur, reg: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Rate/m2: Model</Label>
                <Input type='number' min={0} step={0.01} value={bimRates.model} onChange={(e) => setBimRates(cur => ({ ...cur, model: Number(e.target.value) }))} />
              </div>
            </div>
            <div className='grid md:grid-cols-3 gap-4'>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Scanning Amount</Label>
                <div className='p-2 bg-background border rounded-md text-lg font-semibold'>{currency(scanAmount)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Registration Amount</Label>
                <div className='p-2 bg-background border rounded-md text-lg font-semibold'>{currency(regAmount)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Modelling Amount</Label>
                <div className='p-2 bg-background border rounded-md text-lg font-semibold'>{currency(modelAmount)}</div>
              </div>
            </div>
            <div className='bg-background/50 border rounded-lg p-3 space-y-2'>
              <h3 className='text-sm font-medium'>Estimated Timeline</h3>
              <div className='grid md:grid-cols-3 gap-4 text-sm'>
                <div>
                  <div className='text-xs text-muted-foreground mb-1'>Scanning (~{SCAN_M2_PER_DAY} m²/day)</div>
                  <div className='font-medium'>{scanDays.toFixed(1)} days ({scanHours.toFixed(1)} hrs)</div>
                </div>
                <div>
                  <div className='text-xs text-muted-foreground mb-1'>Registration (1hr / 8 scan hrs)</div>
                  <div className='font-medium'>{regHoursEst.toFixed(1)} hours</div>
                </div>
                <div>
                  <div className='text-xs text-muted-foreground mb-1'>Modelling (~{MODEL_M2_PER_DAY} m²/day)</div>
                  <div className='font-medium'>{modelDays.toFixed(1)} days ({modelHoursEst.toFixed(1)} hrs)</div>
                </div>
              </div>
            </div>
            <div className='grid md:grid-cols-3 gap-4 pt-2 border-t'>
              <div><div className='text-xs text-muted-foreground'>Subtotal</div><div className='text-lg font-semibold'>{currency(subtotalBim)}</div></div>
              <div><div className='text-xs text-muted-foreground'>VAT ({vatPct}%)</div><div className='text-lg font-semibold'>{currency(vatBim)}</div></div>
              <div><div className='text-xs text-muted-foreground'>Total</div><div className='text-lg font-semibold text-primary'>{currency(totalBim)}</div></div>
            </div>
          </div>
        ) : (
          <div className='bg-muted/50 border rounded-lg p-4 space-y-4'>
            <div className='grid md:grid-cols-4 gap-4 items-end'>
              <div className='p-3 rounded-lg bg-background border'>
                <div className='text-xs text-muted-foreground'>Hourly Rate</div>
                <div className='text-lg font-semibold'>{currency(HOURLY_BIM_RATE)}</div>
              </div>
              <div className="space-y-2">
                <Label>Scanning (hours)</Label>
                <Input type='number' min={0} value={bimHrsScan} onChange={(e) => setBimHrsScan(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Registration (hours)</Label>
                <Input type='number' min={0} value={bimHrsReg} onChange={(e) => setBimHrsReg(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Modelling (hours)</Label>
                <Input type='number' min={0} value={bimHrsModel} onChange={(e) => setBimHrsModel(Number(e.target.value))} />
              </div>
            </div>
            <div className='grid md:grid-cols-3 gap-4 pt-2 border-t'>
              <div><div className='text-xs text-muted-foreground'>Subtotal</div><div className='text-lg font-semibold'>{currency(subtotalHrs)}</div></div>
              <div><div className='text-xs text-muted-foreground'>VAT ({vatPct}%)</div><div className='text-lg font-semibold'>{currency(vatHrs)}</div></div>
              <div><div className='text-xs text-muted-foreground'>Total</div><div className='text-lg font-semibold text-primary'>{currency(totalHrs)}</div></div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
