// types.ts

// PDF Generation types
export interface SimplePdfRun {
  text: string;
  x: number;
  y: number;
  size?: number;
  font?: 'regular' | 'bold';
  color?: [number, number, number];
}

export interface SimplePdfImageRun {
  kind: 'image';
  key: string; // Key to an image resource
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SimplePdfLineRun {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  gray?: number;
  color?: [number, number, number];
}

export interface SimplePdfRectRun {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: [number, number, number];
  stroke?: [number, number, number];
  strokeWidth?: number;
}

export type PdfRun = SimplePdfRun | SimplePdfImageRun | SimplePdfLineRun | SimplePdfRectRun;

// Fee Calculation types
export type RoleKey = 'director' | 'senior_architect' | 'architect' | 'technologist' | 'junior' | 'admin';

export type ResultGroup = 'management' | 'professional';

export type ResultKey =
  | 'project_manager' | 'ohs' | 'principal_agent' | 'principal_consultant'
  | 'architect' | 'engineer_civil' | 'engineer_structural' | 'engineer_electrical'
  | 'engineer_mechanical' | 'engineer_fire' | 'quantity_surveyor';

export interface ResultRowDef {
  key: ResultKey;
  label: string;
  group: ResultGroup;
}

export interface BasketRow extends ResultRowDef {
  vow: number;
  fee: number;
  enabled: boolean;
  override: number;
  arcComplexity?: 'low' | 'medium' | 'high';
}

export interface FeeBracket {
  to: number;
  primary: number;
  rate: number;
  over: number;
}

// BIM Section types
export type BimMethod = 'per_m2' | 'per_hour';
export type BimPreset = 'auto' | 'homes' | 'large' | 'custom';

// SACAP Section types
export interface SacapStage {
  name: string;
  pct: number;
  override: number;
  enabled: boolean;
  discountPct: number;
}
export type SacapComplexity = 'low' | 'medium' | 'high';

// Hourly Section types
export interface HourlyPhase {
  key: string;
  name: string;
  hours: Record<RoleKey, number>;
}

// AECOM Rates types
export interface AecomRateItem {
  key: string;
  label: string;
  unit: 'm2' | 'site' | 'each' | 'key' | 'seat' | 'pitch';
  min: number;
  max: number;
}

export interface AecomRateGroup {
  group: string;
  items: AecomRateItem[];
}
