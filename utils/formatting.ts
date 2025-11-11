
const fmt = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });

const normalizeCurrencySpaces = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ').replace(/,/g, ' ');

export const currency = (n: number) => normalizeCurrencySpaces(fmt.format(Math.round(n || 0)));

export const currencyPlain = (n: number) => currency(n);

export const escapeHtml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const pctFmt = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;
