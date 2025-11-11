import type { FeeBracket, ResultKey } from '../types';
import { QS_BRACKETS, STRUCT_BRACKETS, MECH_BRACKETS, PM_BRACKETS, OHS_BRACKETS, ARC_LOW, ARC_MED, ARC_HIGH } from '../constants';

export function calculateBracketFee(value: number, brackets: readonly FeeBracket[]): number {
  if (value <= 0) return 0;
  for (const b of brackets) {
    if (value <= b.to) {
      return b.primary + Math.max(0, value - b.over) * b.rate;
    }
  }
  return 0; // Should be unreachable if last bracket `to` is Infinity
}

export function calculateFee(key: ResultKey, vow: number, arcComplexity: 'low' | 'medium' | 'high' = 'medium'): number {
  if (vow <= 0) return 0;
  switch (key) {
    case 'quantity_surveyor':
      return calculateBracketFee(vow, QS_BRACKETS);
    case 'engineer_structural':
      return calculateBracketFee(vow, STRUCT_BRACKETS);
    case 'engineer_mechanical':
      // Typically 40-60% of structural. Using 50% as a default.
      return calculateBracketFee(vow, MECH_BRACKETS) * 0.5;
    case 'engineer_electrical':
      // Typically 30-40% of structural. Using 35% as a default.
      return calculateBracketFee(vow, MECH_BRACKETS) * 0.35;
    case 'engineer_civil':
        // Civil is highly variable. Assuming 6% flat for now as per some standards.
        return vow * 0.06;
    case 'engineer_fire':
        // Fire is highly variable. Assuming 1.5% flat for now.
        return vow * 0.015;
    case 'project_manager':
      return calculateBracketFee(vow, PM_BRACKETS);
    case 'principal_agent':
        // Typically a portion of PM fee, e.g., 25%
        return calculateBracketFee(vow, PM_BRACKETS) * 0.25;
    case 'principal_consultant':
        // Varies greatly, often an add-on. Can be 10-15% of total fees. Placeholder.
        return 0;
    case 'ohs':
      return calculateBracketFee(vow, OHS_BRACKETS);
    case 'architect':
      const table = arcComplexity === 'low' ? ARC_LOW : arcComplexity === 'medium' ? ARC_MED : ARC_HIGH;
      return calculateBracketFee(vow, table);
    default:
      return 0;
  }
}
