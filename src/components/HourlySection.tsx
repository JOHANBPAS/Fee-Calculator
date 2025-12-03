import React, { useState, useEffect } from 'react';
import type { RoleKey, HourlyPhase } from '../types';
import { useLocalStorageState, useLocalStorageString } from '../hooks/useLocalStorage';
import { currency, currencyPlain } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages } from '../services/pdfService';
import { createPdfDoc, drawHeading, drawKeyValue, drawTableRows, drawTextInColumn, finishDoc, CONTENT_WIDTH, MARGIN_LEFT } from '../services/pdfLayout';
import { ROLE_LABEL, BRAND_COLORS } from '../constants';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Download, ChevronDown, ChevronUp } from 'lucide-react';

interface PhaseHoursProps {
    rates: Record<RoleKey, number>;
    onTotals: (subtotal: number) => void;
}

const PhaseHours: React.FC<PhaseHoursProps> = ({ rates, onTotals }) => {
    const zeroHours: Record<RoleKey, number> = { director: 0, senior_architect: 0, architect: 0, technologist: 0, junior: 0, admin: 0 };
    const defaults: HourlyPhase[] = [
        { key: 'due_diligence', name: 'Due diligence design', hours: { ...zeroHours } },
        { key: 'concept', name: 'Concept design', hours: { ...zeroHours } },
        { key: 'sdp', name: 'SDP Submission', hours: { ...zeroHours } },
        { key: 'municipal', name: 'Municipal submission', hours: { ...zeroHours } },
        { key: 'docs', name: 'Construction Documentation', hours: { ...zeroHours } },
        { key: 'construction', name: 'Construction', hours: { ...zeroHours } },
    ];
    const [projectName, setProjectName] = useLocalStorageString('hourlyProjectName', '');
    const [phases, setPhases] = useLocalStorageState<HourlyPhase[]>('hourlyPhaseRoles', defaults);

    const phaseRows = phases.map((p) => ({ ...p, amount: (Object.keys(p.hours) as RoleKey[]).reduce((s, k) => s + (rates[k] || 0) * (p.hours[k] || 0), 0) }));
    const sub = phaseRows.reduce((a, b) => a + b.amount, 0);

    useEffect(() => { onTotals(sub); }, [sub, onTotals]);

    return (
        <div className='space-y-4'>
            <div className="space-y-2">
                <Label>Project Name</Label>
                <Input placeholder='e.g., Commercial Renovation' value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div className='space-y-4'>
                {phaseRows.map((row, idx) => (
                    <Card key={row.key} className="bg-muted/30">
                        <CardContent className="p-4 space-y-4">
                            <div className='flex items-center justify-between'>
                                <Input
                                    className='font-medium bg-transparent border-none shadow-none focus-visible:ring-0 px-0 h-auto text-base w-auto'
                                    value={row.name}
                                    onChange={e => setPhases(cur => cur.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))}
                                />
                                <div className='text-primary font-semibold'>{currency(row.amount)}</div>
                            </div>
                            <div className='grid md:grid-cols-3 gap-4'>
                                {(Object.keys(zeroHours) as RoleKey[]).map((rk) => (
                                    <div key={rk} className="space-y-1">
                                        <Label className='text-xs text-muted-foreground'>{ROLE_LABEL[rk]} Hours</Label>
                                        <Input type='number' min={0} step={0.5} value={row.hours[rk] || 0} onChange={(e) => setPhases(cur => cur.map((x, i) => i === idx ? { ...x, hours: { ...x.hours, [rk]: Number(e.target.value) } } : x))} />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

interface HourlySectionProps {
    vatPct: number;
}

export function HourlySection({ vatPct }: HourlySectionProps) {
    const [rates, setRates] = useLocalStorageState<Record<RoleKey, number>>('hourlyRates', {
        director: 1400, senior_architect: 1100, architect: 900,
        technologist: 700, junior: 450, admin: 350,
    });
    const roleKeys = Object.keys(ROLE_LABEL) as RoleKey[];
    const [phaseSubtotal, setPhaseSubtotal] = useState(0);
    const subtotal = phaseSubtotal;
    const vat = subtotal * (vatPct / 100);
    const total = subtotal + vat;
    const [showRates, setShowRates] = useState(true);

    const handleExportExcel = () => {
        const storedPhases = JSON.parse(localStorage.getItem('hourlyPhaseRoles') || '[]') as HourlyPhase[];
        const projectName = localStorage.getItem('hourlyProjectName') || 'Untitled Project';
        const headers = ['Phase', 'Role', 'Rate (ZAR/h)', 'Hours', 'Amount (ZAR)'];
        const rows: string[][] = [];

        const projectDetails = getProjectDetailsSnapshot();
        const introRows = [...projectDetails.rows, ['Hourly Project Name', projectName || 'Untitled'], ['Exported On', formatExportDate()]];

        storedPhases.forEach(p => {
            let phaseTotal = 0;
            const phaseRows: string[][] = [];
            (Object.keys(p.hours) as RoleKey[]).forEach(rk => {
                const hrs = p.hours[rk] || 0;
                if (hrs > 0) {
                    const amt = (rates[rk] || 0) * hrs;
                    phaseTotal += amt;
                    phaseRows.push([p.name, ROLE_LABEL[rk], String(rates[rk] || 0), String(hrs), currencyPlain(amt)]);
                }
            });
            if (phaseRows.length > 0) {
                rows.push(...phaseRows);
                rows.push([p.name, 'Phase Total', '', '', currencyPlain(phaseTotal)]);
                rows.push([]);
            }
        });
        rows.push(['', 'GRAND TOTAL (ex VAT)', '', '', currencyPlain(subtotal)]);
        rows.push(['', `VAT (${vatPct}%)`, '', '', currencyPlain(vat)]);
        rows.push(['', 'GRAND TOTAL (inc VAT)', '', '', currencyPlain(total)]);
        exportExcelTable('hourly_fees.xls', headers, rows, { intro: { headers: ['Project Detail', 'Value'], rows: introRows } });
    };

    const handleExportPdf = () => {
        const storedPhases = JSON.parse(localStorage.getItem('hourlyPhaseRoles') || '[]') as HourlyPhase[];
        const projectName = localStorage.getItem('hourlyProjectName') || 'Untitled Project';
        const projectDetails = getProjectDetailsSnapshot();
        const detailRows = [...projectDetails.rows, ['Hourly Project Name', projectName || 'Untitled'], ['Exported On', formatExportDate()]];

        const doc = createPdfDoc();
        const { columns } = doc;

        drawHeading(doc, 'Fee Proposal');
        drawHeading(doc, 'Hourly Services', 12, BRAND_COLORS.accent);
        detailRows.forEach(([label, value]) => drawKeyValue(doc, label, value, { size: 11, lineHeight: 15 }));
        doc.cursorY -= 8;

        // Totals card-equivalents as key/value rows
        drawKeyValue(doc, 'Subtotal (ex VAT)', currencyPlain(subtotal));
        drawKeyValue(doc, `VAT (${vatPct}%)`, currencyPlain(vat));
        drawKeyValue(doc, 'Total (inc VAT)', currencyPlain(total));
        doc.cursorY -= 6;

        const tableCols = [
            columns.label,
            { x: MARGIN_LEFT + CONTENT_WIDTH * 0.45 + 8, width: CONTENT_WIDTH * 0.2, align: 'left' as const },
            { x: MARGIN_LEFT + CONTENT_WIDTH * 0.65 + 12, width: CONTENT_WIDTH * 0.15, align: 'left' as const },
            { x: MARGIN_LEFT + CONTENT_WIDTH * 0.8 + 16, width: CONTENT_WIDTH * 0.2 - 16, align: 'right' as const },
        ];

        drawTableRows(
            doc,
            [
                [
                    { text: 'Role', column: tableCols[0], size: 11, color: BRAND_COLORS.light },
                    { text: 'Rate', column: tableCols[1], size: 11, color: BRAND_COLORS.light },
                    { text: 'Hours', column: tableCols[2], size: 11, color: BRAND_COLORS.light },
                    { text: 'Amount', column: tableCols[3], size: 11, color: BRAND_COLORS.light },
                ],
            ],
            16,
        );

        storedPhases.forEach(p => {
            const relevantHours = (Object.keys(p.hours) as RoleKey[]).filter(rk => (p.hours[rk] || 0) > 0);
            if (relevantHours.length === 0) return;

            drawHeading(doc, p.name, 11, BRAND_COLORS.slate);
            const phaseTotal = relevantHours.reduce((sum, rk) => sum + (p.hours[rk] || 0) * (rates[rk] || 0), 0);
            const rows = relevantHours.map(rk => {
                const hrs = p.hours[rk] || 0;
                const rate = rates[rk] || 0;
                const amount = hrs * rate;
                return [
                    { text: ROLE_LABEL[rk], column: tableCols[0] },
                    { text: currencyPlain(rate), column: tableCols[1] },
                    { text: String(hrs), column: tableCols[2] },
                    { text: currencyPlain(amount), column: tableCols[3] },
                ];
            });
            drawTableRows(doc, rows, 16);

            drawTextInColumn(doc, `${p.name} Total`, columns.label, { size: 11, lineHeight: 16, color: BRAND_COLORS.slate });
            drawTextInColumn(doc, currencyPlain(phaseTotal), columns.value, { size: 11, lineHeight: 16, color: BRAND_COLORS.charcoal });
            doc.cursorY -= 8;
        });

        drawTextInColumn(doc, 'GRAND TOTAL (ex VAT)', columns.label, { size: 11, lineHeight: 16, color: BRAND_COLORS.slate });
        drawTextInColumn(doc, currencyPlain(subtotal), columns.value, { size: 11, lineHeight: 16, color: BRAND_COLORS.charcoal });
        drawTextInColumn(doc, `VAT (${vatPct}%)`, columns.label, { size: 11, lineHeight: 16, color: BRAND_COLORS.slate });
        drawTextInColumn(doc, currencyPlain(vat), columns.value, { size: 11, lineHeight: 16, color: BRAND_COLORS.charcoal });
        drawTextInColumn(doc, 'GRAND TOTAL (inc VAT)', columns.label, { size: 11, lineHeight: 16, color: BRAND_COLORS.slate });
        drawTextInColumn(doc, currencyPlain(total), columns.value, { size: 11, lineHeight: 16, color: BRAND_COLORS.charcoal });

        saveBlob('hourly_summary.pdf', createSimplePdfFromPages(finishDoc(doc)));
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle>Hourly (Phases with Roles)</CardTitle>
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
                <div className='flex items-center justify-between'>
                    <div className='text-sm text-muted-foreground'>Hourly rates (used across phases)</div>
                    <Button variant="ghost" size="sm" onClick={() => setShowRates(v => !v)}>
                        {showRates ? <><ChevronUp className="mr-2 h-4 w-4" /> Hide rates</> : <><ChevronDown className="mr-2 h-4 w-4" /> Show rates</>}
                    </Button>
                </div>
                {showRates && (
                    <div className='grid md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg'>
                        {roleKeys.map((rk) => (
                            <div key={rk} className="space-y-2">
                                <Label>{ROLE_LABEL[rk]} Rate (ZAR/h)</Label>
                                <Input type='number' min={0} step={10} value={rates[rk] || 0} onChange={(e) => setRates(cur => ({ ...cur, [rk]: Number(e.target.value) }))} />
                            </div>
                        ))}
                    </div>
                )}

                <PhaseHours rates={rates} onTotals={setPhaseSubtotal} />

                <div className='grid md:grid-cols-3 gap-4 pt-4 border-t'>
                    <div><div className='text-xs text-muted-foreground'>Subtotal</div><div className='text-lg font-semibold'>{currency(subtotal)}</div></div>
                    <div><div className='text-xs text-muted-foreground'>VAT ({vatPct}%)</div><div className='text-lg font-semibold'>{currency(vat)}</div></div>
                    <div><div className='text-xs text-muted-foreground'>Total</div><div className='text-lg font-semibold text-primary'>{currency(total)}</div></div>
                </div>
            </CardContent>
        </Card>
    );
}
