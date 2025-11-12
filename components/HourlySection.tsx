import React, { useState, useEffect } from 'react';
import type { RoleKey, HourlyPhase, PdfRun } from '../types';
import { useLocalStorageState, useLocalStorageString } from '../hooks/useLocalStorage';
import { currency, currencyPlain } from '../utils/formatting';
import { exportExcelTable, saveBlob } from '../utils/export';
import { createSimplePdfFromPages, SIMPLE_PDF_PAGE } from '../services/pdfService';
import { ROLE_LABEL, BRAND_COLORS } from '../constants';
import { getProjectDetailsSnapshot, formatExportDate } from '../utils/projectDetails';

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
        <div className='p-3 bg-zinc-800/50 rounded-xl space-y-3'>
            <div className='text-sm font-medium'>Project Name</div>
            <input className='w-full bg-zinc-800 rounded-xl p-2' placeholder='e.g., Commercial Renovation' value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            <div className='space-y-2'>
                {phaseRows.map((row, idx) => (
                    <div key={row.key} className='p-3 rounded-xl ring-1 ring-white/5 bg-zinc-900/60'>
                        <div className='flex items-center justify-between mb-2'>
                            <input className='text-sm font-medium bg-transparent' value={row.name} onChange={e => setPhases(cur => cur.map((p, i) => i === idx ? {...p, name: e.target.value} : p))} />
                            <div className='text-amber-300 font-semibold'>{currency(row.amount)}</div>
                        </div>
                        <div className='grid md:grid-cols-3 gap-3'>
                            {(Object.keys(zeroHours) as RoleKey[]).map((rk) => (
                                <div key={rk}>
                                    <div className='text-xs text-zinc-400 mb-1'>{ROLE_LABEL[rk]} Hours</div>
                                    <input type='number' min={0} step={0.5} className='w-full bg-zinc-800 rounded-xl p-2' value={row.hours[rk] || 0} onChange={(e) => setPhases(cur => cur.map((x, i) => i === idx ? { ...x, hours: { ...x.hours, [rk]: Number(e.target.value) } } : x))} />
                                </div>
                            ))}
                        </div>
                    </div>
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
            if(phaseRows.length > 0) {
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

        const pages: PdfRun[][] = [];
        const brand = BRAND_COLORS;
        const margin = 48;
        const width = SIMPLE_PDF_PAGE.width - margin * 2;
        const tableWidth = width + 20;
        const headerX = margin - 10;
        const colX = [margin, margin + 200, margin + 320, margin + 430];
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
            text('Hourly Services', margin, y - 44, 12, false, brand.light);
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

        const addSummary = (label: string, value: string, highlight = false) => {
            const rowHeight = 20;
            checkBreak();
            rect(headerX, y, tableWidth, rowHeight, highlight ? brand.accent : brand.light);
            text(label, margin, y - 6, 10, true, highlight ? brand.charcoal : brand.slate);
            text(value, margin + width - 80, y - 6, 10, true, brand.charcoal);
            y -= rowHeight;
        };

        const addCards = () => {
            const cards: [string, string][] = [
                ['Subtotal (ex VAT)', currencyPlain(subtotal)],
                [`VAT (${vatPct}%)`, currencyPlain(vat)],
                ['Total (inc VAT)', currencyPlain(total)],
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

        storedPhases.forEach(p => {
            const relevantHours = (Object.keys(p.hours) as RoleKey[]).filter(rk => (p.hours[rk] || 0) > 0);
            if (relevantHours.length === 0) return;

            checkBreak();
            y -= 4;
            text(p.name, margin, y, 11, true, brand.slate);
            y -= 16;
            addRow(['Role', 'Rate', 'Hours', 'Amount'], { header: true });

            let phaseTotal = 0;
            relevantHours.forEach(rk => {
                const hrs = p.hours[rk] || 0;
                const rate = rates[rk] || 0;
                const amount = hrs * rate;
                phaseTotal += amount;
                addRow([ROLE_LABEL[rk], currencyPlain(rate), String(hrs), currencyPlain(amount)]);
            });
            y -= 4;
            addSummary(`${p.name} Total`, currencyPlain(phaseTotal));
            y -= 8;
        });

        y -= 6;
        addSummary('GRAND TOTAL (ex VAT)', currencyPlain(subtotal));
        addSummary(`VAT (${vatPct}%)`, currencyPlain(vat));
        addSummary('GRAND TOTAL (inc VAT)', currencyPlain(total), true);

        pages.push(cur);
        saveBlob('hourly_summary.pdf', createSimplePdfFromPages(pages));
    };

    return (
        <section className='p-3 bg-zinc-900 rounded-2xl shadow space-y-4'>
            <div className='flex items-center justify-between'>
                 <h2 className='text-lg font-medium'>Hourly (Phases with Roles)</h2>
                 <div className='flex items-center gap-2'>
                    <button className='px-3 py-2 bg-zinc-100 text-zinc-900 rounded-xl text-sm transition-colors duration-150 hover:bg-zinc-200' onClick={handleExportExcel}>Export Excel</button>
                    <button className='px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm transition-colors duration-150 hover:bg-emerald-600' onClick={handleExportPdf}>Export PDF</button>
                 </div>
            </div>

            <div className='flex items-center justify-between'>
                <div className='text-sm text-zinc-400'>Hourly rates (used across phases)</div>
                <button className='text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700' onClick={() => setShowRates(v => !v)}>{showRates ? 'Hide rates' : 'Show rates'}</button>
            </div>
            {showRates && (
                <div className='grid md:grid-cols-3 gap-3'>
                    {roleKeys.map((rk) => (
                        <div key={rk}>
                            <div className='text-sm mb-1'>{ROLE_LABEL[rk]} Rate (ZAR/h)</div>
                            <input type='number' min={0} step={10} className='w-full bg-zinc-800 rounded-xl p-2' value={rates[rk] || 0} onChange={(e) => setRates(cur => ({ ...cur, [rk]: Number(e.target.value) }))} />
                        </div>
                    ))}
                </div>
            )}
            <PhaseHours rates={rates} onTotals={setPhaseSubtotal} />
            <div className='grid md:grid-cols-3 gap-3'>
                <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>Subtotal</div><div className='text-lg'>{currency(subtotal)}</div></div>
                <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>VAT ({vatPct}%)</div><div className='text-lg'>{currency(vat)}</div></div>
                <div className='p-3 rounded-xl bg-white/5'><div className='text-xs text-zinc-400'>Total</div><div className='text-lg'>{currency(total)}</div></div>
            </div>
        </section>
    );
}
