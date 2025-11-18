import {
  RESULT_ROWS,
  ARC_LOW,
  ARC_MED,
  ARC_HIGH,
  AECOM_RATES,
  defaultRate,
  BIM_PRESETS,
  HOURLY_BIM_RATE,
  SCAN_M2_PER_DAY,
  HOURS_PER_DAY,
  MODEL_M2_PER_DAY,
} from '../constants';
import { calculateFee } from '../services/feeService';
import { getProjectDetailsSnapshot } from './projectDetails';
import type { ResultKey, SacapComplexity, SacapStage, BimMethod, BimPreset, HourlyPhase, RoleKey } from '../types';

type ManualRow = {
  id: string;
  name: string;
  amount: number;
  enabled: boolean;
};

const DEFAULT_SELECTED: ResultKey[] = [
  'project_manager',
  'architect',
  'quantity_surveyor',
  'engineer_structural',
];

const DEFAULT_SACAP_STAGES: SacapStage[] = [
  { name: 'Stage 1: Inception', pct: 2, override: 0, enabled: true, discountPct: 0 },
  { name: 'Stage 2: Concept and Viability', pct: 15, override: 0, enabled: true, discountPct: 0 },
  { name: 'Stage 3: Design Development', pct: 20, override: 0, enabled: true, discountPct: 0 },
  { name: 'Stage 4.1: Documentation and Procurement', pct: 10, override: 0, enabled: true, discountPct: 0 },
  { name: 'Stage 4.2: Documentation and Procurement', pct: 20, override: 0, enabled: true, discountPct: 0 },
  { name: 'Stage 5: Construction', pct: 30, override: 0, enabled: true, discountPct: 0 },
  { name: 'Stage 6: Handover and Close-out', pct: 3, override: 0, enabled: true, discountPct: 0 },
];

function getString(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  return raw ?? fallback;
}

function getNumber(key: string, fallback = 0) {
  const raw = getString(key, '');
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function getJson<T>(key: string, fallback: T): T {
  const raw = getString(key, '');
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildSacapSummary(globalVow: number, vatPct: number) {
  const vow = getNumber('sacapVow', globalVow);
  const complexity = getString('sacapComplexity', 'low') as SacapComplexity;
  const stages = getJson<SacapStage[]>('sacapStages', DEFAULT_SACAP_STAGES);
  const overallDiscountPct = Math.max(0, Math.min(100, getNumber('sacapOverallDiscountPct', 0)));

  const aecomOptions = AECOM_RATES.flatMap((g) => g.items.filter((i) => i.unit === 'm2').map((i) => ({ ...i, group: g.group })));
  const aecomKey = getString('sacapAecomKey', aecomOptions[0]?.key || '');
  const aecomSize = getNumber('sacapAecomSize', 1000);
  const aecomRateChoice = getString('sacapAecomRateChoice', 'mid');
  const selectedAecom = aecomOptions.find((item) => item.key === aecomKey);
  const aecomRate = selectedAecom
    ? aecomRateChoice === 'min'
      ? selectedAecom.min
      : aecomRateChoice === 'max'
        ? selectedAecom.max
        : defaultRate(selectedAecom)
    : 0;
  const aecomEstimate = selectedAecom ? Math.max(0, Math.round(aecomRate * Math.max(0, aecomSize || 0))) : 0;

  const arcTable = complexity === 'low' ? ARC_LOW : complexity === 'medium' ? ARC_MED : ARC_HIGH;
  let baseFee = 0;
  for (const bracket of arcTable) {
    if (vow <= bracket.to) {
      baseFee = bracket.primary + Math.max(0, vow - bracket.over) * bracket.rate;
      break;
    }
  }

  const overallFactor = Math.max(0, 1 - (overallDiscountPct || 0) / 100);
  const rows = stages.map((s) => {
    const stageFee = baseFee * (s.pct / 100);
    const discountedStageFee = stageFee * Math.max(0, 1 - ((s.discountPct || 0) / 100));
    const preOverallAmount = s.override > 0 ? s.override : discountedStageFee;
    const amount = preOverallAmount * overallFactor;
    return { ...s, stageFee, discountedStageFee, preOverallAmount, amount };
  });

  const enabledRows = rows.filter((r) => r.enabled);
  const subtotalBeforeOverall = enabledRows.reduce((a, b) => a + b.preOverallAmount, 0);
  const subtotal = enabledRows.reduce((a, b) => a + b.amount, 0);
  const totalDiscountAmount = subtotalBeforeOverall - subtotal;
  const vat = subtotal * (vatPct / 100);
  const total = subtotal + vat;

  return {
    data: {
      vow,
      complexity,
      baseFee,
      overallDiscountPct,
      subtotal,
      vat,
      total,
      totalDiscountAmount,
      stages: rows,
      aecom: { key: aecomKey, size: aecomSize, rateChoice: aecomRateChoice, estimate: aecomEstimate },
    },
    storageKeys: {
      strings: {
        sacapComplexity: complexity,
        sacapAecomKey: aecomKey,
        sacapAecomRateChoice: aecomRateChoice,
      },
      numbers: {
        sacapVow: vow,
        sacapOverallDiscountPct: overallDiscountPct,
        sacapAecomSize: aecomSize,
      },
      json: {
        sacapStages: stages,
      },
    },
  };
}

function buildBimSummary(clientName: string, vatPct: number) {
  const method = getString('bimMethod', 'per_m2') as BimMethod;
  const preset = getString('bimPreset', 'auto') as BimPreset;
  const area = getNumber('bimArea', 1000);
  let rates = getJson<{ scan: number; reg: number; model: number }>('bimRates', { scan: 8.35, reg: 2.5, model: 9.75 });
  const overrides = {
    scan: getNumber('bimOverrideScan', 0),
    reg: getNumber('bimOverrideReg', 0),
    model: getNumber('bimOverrideModel', 0),
  };
  const hours = {
    scan: getNumber('bimHrsScan', 0),
    reg: getNumber('bimHrsReg', 0),
    model: getNumber('bimHrsModel', 0),
  };

  if (method === 'per_m2') {
    if (preset === 'homes') rates = BIM_PRESETS.homes;
    else if (preset === 'large') rates = BIM_PRESETS.large;
    else if (preset === 'auto') {
      if (area > 1000) rates = BIM_PRESETS.large;
      else if (area < 500) rates = BIM_PRESETS.homes;
    }
  }

  const scanDays = area > 0 ? area / SCAN_M2_PER_DAY : 0;
  const scanHours = scanDays * HOURS_PER_DAY;
  const regHoursEst = scanHours / 8;
  const modelDays = area > 0 ? area / MODEL_M2_PER_DAY : 0;

  const scanAmount = overrides.scan > 0 ? overrides.scan : rates.scan * area;
  const regAmount = overrides.reg > 0 ? overrides.reg : rates.reg * area;
  const modelAmount = overrides.model > 0 ? overrides.model : rates.model * area;
  const subtotalBim = scanAmount + regAmount + modelAmount;
  const vatBim = subtotalBim * (vatPct / 100);
  const totalBim = subtotalBim + vatBim;

  const subtotalHrs = (hours.scan + hours.reg + hours.model) * HOURLY_BIM_RATE;
  const vatHrs = subtotalHrs * (vatPct / 100);
  const totalHrs = subtotalHrs + vatHrs;

  const subtotal = method === 'per_m2' ? subtotalBim : subtotalHrs;
  const vat = method === 'per_m2' ? vatBim : vatHrs;
  const total = method === 'per_m2' ? totalBim : totalHrs;

  return {
    data: {
      method,
      preset,
      area,
      rates,
      overrides,
      hours,
      subtotal,
      vat,
      total,
      timeline: {
        scanDays,
        regHoursEst,
        modelDays,
      },
      hourlyTotals: {
        subtotal: subtotalHrs,
        vat: vatHrs,
        total: totalHrs,
      },
    },
    storageKeys: {
      strings: {
        bimMethod: method,
        bimPreset: preset,
      },
      numbers: {
        bimArea: area,
        bimOverrideScan: overrides.scan,
        bimOverrideReg: overrides.reg,
        bimOverrideModel: overrides.model,
        bimHrsScan: hours.scan,
        bimHrsReg: hours.reg,
        bimHrsModel: hours.model,
      },
      json: {
        bimRates: rates,
      },
    },
  };
}

function buildHourlySummary(vatPct: number) {
  const defaultRates: Record<RoleKey, number> = {
    director: 1400,
    senior_architect: 1100,
    architect: 900,
    technologist: 700,
    junior: 450,
    admin: 350,
  };
  const rates = getJson<Record<RoleKey, number>>('hourlyRates', defaultRates);
  const phases = getJson<HourlyPhase[]>('hourlyPhaseRoles', []);
  const projectName = getString('hourlyProjectName', '');

  const phasesWithTotals = phases.map((p) => {
    const amount = (Object.keys(p.hours) as RoleKey[]).reduce((sum, role) => sum + (rates[role] || 0) * (p.hours[role] || 0), 0);
    return { ...p, amount };
  });

  const subtotal = phasesWithTotals.reduce((sum, p) => sum + p.amount, 0);
  const vat = subtotal * (vatPct / 100);
  const total = subtotal + vat;

  return {
    data: {
      projectName,
      rates,
      phases: phasesWithTotals,
      subtotal,
      vat,
      total,
    },
    storageKeys: {
      strings: {
        hourlyProjectName: projectName,
      },
      numbers: {},
      json: {
        hourlyRates: rates,
        hourlyPhaseRoles: phases,
      },
    },
  };
}

const PERSISTED_LOCAL_KEYS = [
  'clientName',
  'vatPct',
  'activeTab',
  'sacapVow',
  'sacapComplexity',
  'sacapStages',
  'sacapOverallDiscountPct',
  'sacapAecomKey',
  'sacapAecomSize',
  'sacapAecomRateChoice',
  'basketDiscountPct',
  'basketTargetPct',
  'basketSelectedRows',
  'basketVowOverride',
  'basketArcComplexity',
  'basketManualRows',
  'basketEffectivePctOverride',
  'hourlyProjectName',
  'hourlyRates',
  'hourlyPhaseRoles',
  'bimMethod',
  'bimPreset',
  'bimArea',
  'bimRates',
  'bimOverrideScan',
  'bimOverrideReg',
  'bimOverrideModel',
  'bimHrsScan',
  'bimHrsReg',
  'bimHrsModel',
];

function captureLocalStorage(keys: string[]): Record<string, string> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return {};
  const entries: Record<string, string> = {};
  keys.forEach((key) => {
    const value = window.localStorage.getItem(key);
    if (value !== null && value !== undefined) entries[key] = value;
  });
  return entries;
}

export interface BasketSummaryRow {
  label: string;
  group: string;
  baseFee: number;
  proposedFee: number;
  effectivePct: number;
  isManual: boolean;
  isPinned: boolean;
}

export interface BasketSummary {
  rows: BasketSummaryRow[];
  totalBaseFee: number;
  subtotal: number;
}

export interface FeeSnapshot {
  clientName: string;
  vatPct: number;
  globalVow: number;
  activeTab: string;
  lastEditedBy?: string | null;
  lastEditedByEmail?: string | null;
  projectDetails: ReturnType<typeof getProjectDetailsSnapshot>;
  basket: BasketSummary;
  sacap: {
    vow: number;
    complexity: SacapComplexity;
    baseFee: number;
    overallDiscountPct: number;
    subtotal: number;
    vat: number;
    total: number;
    totalDiscountAmount: number;
    stages: Array<
      SacapStage & {
        amount: number;
        stageFee: number;
        discountedStageFee: number;
        preOverallAmount: number;
      }
    >;
    aecom: {
      key: string;
      size: number;
      rateChoice: string;
      estimate: number;
    };
  };
  bim: {
    method: BimMethod;
    preset: BimPreset;
    area: number;
    rates: { scan: number; reg: number; model: number };
    overrides: { scan: number; reg: number; model: number };
    hours: { scan: number; reg: number; model: number };
    subtotal: number;
    vat: number;
    total: number;
    timeline: {
      scanDays: number;
      regHoursEst: number;
      modelDays: number;
    };
    hourlyTotals: {
      subtotal: number;
      vat: number;
      total: number;
    };
  };
  hourly: {
    projectName: string;
    rates: Record<RoleKey, number>;
    phases: Array<HourlyPhase & { amount: number }>;
    subtotal: number;
    vat: number;
    total: number;
  };
  storageKeys: {
    strings: Record<string, string>;
    numbers: Record<string, number>;
    json: Record<string, unknown>;
  };
  rawLocalStorage?: Record<string, string>;
  totals: {
    vatAmount: number;
    totalWithVat: number;
  };
  savedAt: string;
}

export function buildBasketSummary(globalVow: number, vatPct: number): BasketSummary & { storageKeys: Record<string, unknown> } {
  const discountPct = getNumber('basketDiscountPct', 0);
  const basketTargetPct = getNumber('basketTargetPct', 0);
  const selectedRows = getJson<ResultKey[]>('basketSelectedRows', DEFAULT_SELECTED);
  const vowOverride = getJson<Partial<Record<ResultKey, number>>>('basketVowOverride', {});
  const arcComplexity = getJson<Partial<Record<ResultKey, SacapComplexity>>>('basketArcComplexity', {});
  const manualRows = getJson<ManualRow[]>('basketManualRows', []);
  const effectivePctOverride = getJson<Record<string, number>>('basketEffectivePctOverride', {});

  const allRows = [
    ...RESULT_ROWS.map((def) => {
      const vow = vowOverride[def.key] || globalVow;
      const baseFee = calculateFee(def.key, vow, arcComplexity[def.key]);
      return { ...def, isManual: false, id: def.key, vow, baseFee, enabled: selectedRows.includes(def.key), name: def.label };
    }),
    ...manualRows.map((m) => ({
      ...m,
      key: m.id,
      id: m.id,
      isManual: true,
      vow: 0,
      baseFee: m.amount,
      label: m.name,
      group: 'professional' as const,
    })),
  ];

  const targetAmount = globalVow * (basketTargetPct / 100);
  const hasTarget = basketTargetPct > 0 && globalVow > 0;

  let proposedFees: Record<string, number> = {};

  if (hasTarget) {
    const pinnedRows = allRows.filter((r) => r.enabled && effectivePctOverride[r.id] != null);
    const unpinnedRows = allRows.filter((r) => r.enabled && effectivePctOverride[r.id] == null);

    let pinnedTotal = 0;
    pinnedRows.forEach((r) => {
      const fee = globalVow * (effectivePctOverride[r.id]! / 100);
      proposedFees[r.id] = fee;
      pinnedTotal += fee;
    });

    const remainingTarget = targetAmount - pinnedTotal;
    const unpinnedBaseTotal = unpinnedRows.reduce((sum, r) => sum + r.baseFee, 0);

    if (unpinnedBaseTotal > 0) {
      const factor = remainingTarget > 0 ? remainingTarget / unpinnedBaseTotal : 0;
      unpinnedRows.forEach((r) => {
        proposedFees[r.id] = r.baseFee * factor;
      });
    } else if (unpinnedRows.length > 0) {
      const perRowAmount = remainingTarget / unpinnedRows.length;
      unpinnedRows.forEach((r) => {
        proposedFees[r.id] = perRowAmount;
      });
    }
  } else {
    const discountFactor = 1 - discountPct / 100;
    allRows.forEach((r) => {
      proposedFees[r.id] = r.baseFee * discountFactor;
    });
  }

  const finalRows = allRows.map((r) => {
    const proposedFee = r.enabled ? proposedFees[r.id] ?? 0 : 0;
    const effectivePct = globalVow > 0 ? (proposedFee / globalVow) * 100 : 0;
    return { ...r, proposedFee, effectivePct, isPinned: effectivePctOverride[r.id] != null };
  });

  const subtotal = finalRows.reduce((sum, r) => sum + (r.enabled ? r.proposedFee : 0), 0);
  const totalBaseFee = finalRows.reduce((sum, r) => sum + (r.enabled ? r.baseFee : 0), 0);

  return {
    rows: finalRows.map((r) => ({
      label: r.label,
      group: r.group,
      baseFee: r.baseFee,
      proposedFee: r.proposedFee,
      effectivePct: r.effectivePct,
      isManual: r.isManual,
      isPinned: r.isPinned,
    })),
    subtotal,
    totalBaseFee,
    storageKeys: {
      basketDiscountPct: discountPct,
      basketTargetPct,
      basketSelectedRows: selectedRows,
      basketVowOverride: vowOverride,
      basketArcComplexity: arcComplexity,
      basketManualRows: manualRows,
      basketEffectivePctOverride: effectivePctOverride,
    },
  };
}

export function buildFeeSnapshot(params: {
  clientName: string;
  vatPct: number;
  globalVow: number;
  activeTab: string;
}): FeeSnapshot {
  const basket = buildBasketSummary(params.globalVow, params.vatPct);
  const projectDetails = getProjectDetailsSnapshot({ clientName: params.clientName });
  const sacapSummary = buildSacapSummary(params.globalVow, params.vatPct);
  const bimSummary = buildBimSummary(params.clientName, params.vatPct);
  const hourlySummary = buildHourlySummary(params.vatPct);
  const rawLocalStorage = captureLocalStorage(PERSISTED_LOCAL_KEYS);

  return {
    clientName: params.clientName,
    vatPct: params.vatPct,
    globalVow: params.globalVow,
    activeTab: params.activeTab,
    projectDetails,
    basket,
    sacap: sacapSummary.data,
    bim: bimSummary.data,
    hourly: hourlySummary.data,
    storageKeys: {
      strings: {
        clientName: params.clientName,
        activeTab: params.activeTab,
        ...sacapSummary.storageKeys.strings,
        ...bimSummary.storageKeys.strings,
        ...hourlySummary.storageKeys.strings,
      },
      numbers: {
        vatPct: params.vatPct,
        globalVow: params.globalVow,
        ...sacapSummary.storageKeys.numbers,
        ...bimSummary.storageKeys.numbers,
        ...hourlySummary.storageKeys.numbers,
      },
      json: {
        ...basket.storageKeys,
        ...sacapSummary.storageKeys.json,
        ...bimSummary.storageKeys.json,
        ...hourlySummary.storageKeys.json,
      },
    },
    rawLocalStorage,
    totals: {
      vatAmount: basket.subtotal * (params.vatPct / 100),
      totalWithVat: basket.subtotal * (1 + params.vatPct / 100),
    },
    savedAt: new Date().toISOString(),
  };
}

export function applySnapshotToApp(
  snapshot: FeeSnapshot,
  setters: {
    setClientName: (val: string) => void;
    setVatPct: (val: number) => void;
    setGlobalVow: (val: number) => void;
    setActiveTab: (val: string) => void;
  },
) {
  const storage = snapshot.storageKeys ?? { strings: {}, numbers: {}, json: {} } as FeeSnapshot['storageKeys'];
  const rawStorage = snapshot.rawLocalStorage ?? {};
  if (typeof window !== 'undefined') {
    Object.entries(storage.strings).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
    Object.entries(storage.numbers).forEach(([key, value]) => {
      window.localStorage.setItem(key, String(value));
    });
    Object.entries(storage.json).forEach(([key, value]) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    });
    Object.entries(rawStorage).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
  }
  setters.setClientName(snapshot.clientName);
  setters.setVatPct(snapshot.vatPct);
  setters.setGlobalVow(snapshot.globalVow);
  setters.setActiveTab(snapshot.activeTab);
}
