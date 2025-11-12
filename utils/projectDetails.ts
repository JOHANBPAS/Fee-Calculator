import type { SacapComplexity } from '../types';
import { AECOM_RATES } from '../constants';

type Overrides = Partial<{
  clientName: string;
  aecomKey: string;
  aecomSize: number;
  complexity: SacapComplexity;
}>;

const COMPLEXITY_LABEL: Record<SacapComplexity, string> = {
  low: 'Low Complexity',
  medium: 'Medium Complexity',
  high: 'High Complexity',
};

const getSafeString = (key: string, fallback = '') => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const getSafeNumber = (key: string, fallback = 0) => {
  const raw = getSafeString(key, '');
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
};

export interface ProjectDetailSnapshot {
  clientName: string;
  buildingCategory: string;
  buildingType: string;
  buildingSizeLabel: string;
  complexity: SacapComplexity;
  complexityLabel: string;
  rows: string[][];
}

export function getProjectDetailsSnapshot(overrides: Overrides = {}): ProjectDetailSnapshot {
  const clientName = overrides.clientName ?? getSafeString('clientName', '');
  const aecomKey = overrides.aecomKey ?? getSafeString('sacapAecomKey', '');
  const aecomSize = overrides.aecomSize ?? getSafeNumber('sacapAecomSize', 0);
  const complexity = overrides.complexity ?? (getSafeString('sacapComplexity', 'low') as SacapComplexity);

  const options = AECOM_RATES.flatMap(group =>
    group.items
      .filter(item => item.unit === 'm2')
      .map(item => ({ ...item, group: group.group })),
  );
  const selected = options.find(item => item.key === aecomKey);

  const buildingCategory = selected?.group ?? (aecomKey ? 'Custom selection' : 'Not specified');
  const buildingType = selected?.label ?? (aecomKey ? 'Custom rate selection' : 'Not specified');
  const buildingSizeLabel = aecomSize > 0 ? `${aecomSize.toLocaleString('en-ZA')} m²` : 'Not specified';
  const complexityLabel = COMPLEXITY_LABEL[complexity] ?? 'Not specified';

  const rows: string[][] = [
    ['Client / Project', clientName || 'Not specified'],
    ['Building Category', buildingCategory],
    ['Building Type', buildingType],
    ['Building Size', buildingSizeLabel],
    ['Project Complexity', complexityLabel],
  ];

  return {
    clientName,
    buildingCategory,
    buildingType,
    buildingSizeLabel,
    complexity,
    complexityLabel,
    rows,
  };
}

export function formatExportDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
