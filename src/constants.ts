import type { AecomRateItem, AecomRateGroup, ResultRowDef, RoleKey } from './types';

// BIM constants
export const HOURS_PER_DAY = 8;
export const SCAN_M2_PER_DAY = 850;
export const MODEL_M2_PER_DAY = 250;
export const BIM_PRESETS = {
  homes: { scan: 8.62, reg: 3.45, model: 27.6 },
  large: { scan: 8.35, reg: 2.5, model: 9.75 },
} as const;
export const HOURLY_BIM_RATE = 700;


// Basket core constants
export const RESULT_ROWS: ResultRowDef[] = [
  { key: 'project_manager', label: 'Project Manager', group: 'management' },
  { key: 'ohs', label: 'Health & Safety', group: 'management' },
  { key: 'principal_agent', label: 'Principal Agent', group: 'management' },
  { key: 'principal_consultant', label: 'Principal Consultant', group: 'management' },
  { key: 'architect', label: 'Architect', group: 'professional' },
  { key: 'engineer_civil', label: 'Engineer - Civil', group: 'professional' },
  { key: 'engineer_structural', label: 'Engineer - Structural', group: 'professional' },
  { key: 'engineer_electrical', label: 'Engineer - Electrical', group: 'professional' },
  { key: 'engineer_mechanical', label: 'Engineer - Mechanical', group: 'professional' },
  { key: 'engineer_fire', label: 'Engineer - Fire', group: 'professional' },
  { key: 'quantity_surveyor', label: 'Quantity Surveyor', group: 'professional' },
];

export const QS_BRACKETS: { to: number; primary: number; rate: number; over: number }[] = [
  { to: 1_000_000, primary: 23_000, rate: 0.1325, over: 0 }, { to: 2_000_000, primary: 155_500, rate: 0.13, over: 1_000_000 },
  { to: 4_000_000, primary: 285_500, rate: 0.1275, over: 2_000_000 }, { to: 8_000_000, primary: 540_500, rate: 0.1095, over: 4_000_000 },
  { to: 16_000_000, primary: 978_500, rate: 0.0955, over: 8_000_000 }, { to: 32_000_000, primary: 1_742_500, rate: 0.083, over: 16_000_000 },
  { to: 64_000_000, primary: 3_070_500, rate: 0.074, over: 32_000_000 }, { to: 128_000_000, primary: 5_438_500, rate: 0.0675, over: 64_000_000 },
  { to: 256_000_000, primary: 9_758_500, rate: 0.0538, over: 128_000_000 }, { to: 500_000_000, primary: 16_644_900, rate: 0.052, over: 256_000_000 },
  { to: 1_500_000_000, primary: 29_332_400, rate: 0.042, over: 500_000_000 }, { to: 3_000_000_000, primary: 71_332_900, rate: 0.0375, over: 1_500_000_000 },
  { to: 10_000_000_000, primary: 127_582_900, rate: 0.027, over: 3_000_000_000 }, { to: Infinity, primary: 316_582_900, rate: 0.0225, over: 10_000_000_000 },
];

export const ENG_THRESHOLDS = [
  { to: 1_899_000, over: 850_000 }, { to: 9_347_000, over: 1_899_000 },
  { to: 19_066_000, over: 9_347_000 }, { to: 47_372_000, over: 19_066_000 },
  { to: 94_960_000, over: 47_372_000 }, { to: 572_000_000, over: 94_960_000 },
  { to: Infinity, over: 572_000_000 },
] as const;

type EngBracket = { to: number; primary: number; rate: number; over: number };
function makeEngBrackets(primary: number[], ratesPct: number[]): EngBracket[] {
  return ENG_THRESHOLDS.map((t, i) => ({ ...t, primary: primary[i], rate: ratesPct[i] / 100 }));
}
const STRUCT_PRIMARY = [106_300, 237_400, 882_400, 1_857_000, 4_121_400, 7_454_800, 40_840_800];
const STRUCT_RATE = [15.0, 12.0, 10.5, 10.0, 9.5, 9.0, 9.0];
export const STRUCT_BRACKETS = makeEngBrackets(STRUCT_PRIMARY, STRUCT_RATE);
const MECH_PRIMARY = [127_500, 284_900, 1_224_500, 2_236_400, 4_926_700, 9_201_700, 49_764_000];
const MECH_RATE = [18.0, 15.0, 12.5, 11.5, 11.0, 10.0, 10.0];
export const MECH_BRACKETS = makeEngBrackets(MECH_PRIMARY, MECH_RATE);

export const PM_BRACKETS: { to: number; primary: number; rate: number; over: number }[] = [
  { to: 1_000_000, primary: 16_650, rate: 0.08, over: 0 }, { to: 2_000_000, primary: 96_650, rate: 0.08, over: 1_000_000 },
  { to: 4_000_000, primary: 175_400, rate: 0.0795, over: 2_000_000 }, { to: 8_000_000, primary: 334_400, rate: 0.0785, over: 4_000_000 },
  { to: 16_000_000, primary: 648_400, rate: 0.078, over: 8_000_000 }, { to: 32_000_000, primary: 1_272_400, rate: 0.07, over: 16_000_000 },
  { to: 64_000_000, primary: 2_392_340, rate: 0.063, over: 32_000_000 }, { to: 128_000_000, primary: 4_408_340, rate: 0.056, over: 64_000_000 },
  { to: 256_000_000, primary: 7_992_400, rate: 0.049, over: 128_000_000 }, { to: 500_000_000, primary: 14_264_400, rate: 0.0424, over: 256_000_000 },
  { to: 1_000_000_000, primary: 24_610_000, rate: 0.0366, over: 500_000_000 }, { to: 2_000_000_000, primary: 42_910_000, rate: 0.0316, over: 1_000_000_000 },
  { to: 3_000_000_000, primary: 74_510_000, rate: 0.0283, over: 2_000_000_000 }, { to: Infinity, primary: 102_810_000, rate: 0.0258, over: 3_000_000_000 },
];

export const OHS_BRACKETS: { to: number; primary: number; rate: number; over: number }[] = [
  { to: 10_000_000, primary: 5_195, rate: 0.033, over: 0 }, { to: 20_000_000, primary: 335_086, rate: 0.0297, over: 10_000_000 },
  { to: 40_000_000, primary: 632_248, rate: 0.0267, over: 20_000_000 }, { to: 80_000_000, primary: 1_166_309, rate: 0.0241, over: 40_000_000 },
  { to: 160_000_000, primary: 2_128_450, rate: 0.0211, over: 80_000_000 }, { to: 320_000_000, primary: 3_819_989, rate: 0.0186, over: 160_000_000 },
  { to: 640_000_000, primary: 6_795_767, rate: 0.016, over: 320_000_000 }, { to: 1_280_000_000, primary: 11_916_103, rate: 0.0138, over: 640_000_000 },
  { to: 2_560_000_000, primary: 20_727_063, rate: 0.0118, over: 1_280_000_000 }, { to: Infinity, primary: 35_888_570, rate: 0.0102, over: 2_560_000_000 },
];

type ArcBracket = { to: number; primary: number; rate: number; over: number };
export const ARC_LOW: ArcBracket[] = [
    { to: 200000, primary: 11341.85, rate: 0.1753, over: 1 }, { to: 650000, primary: 46393.33, rate: 0.1685, over: 200001 },
    { to: 2000000, primary: 122193.97, rate: 0.1243, over: 650001 }, { to: 4000000, primary: 289927.74, rate: 0.1023, over: 2000001 },
    { to: 6500000, primary: 506559.8, rate: 0.1055, over: 4000001 }, { to: 13000000, primary: 770251.28, rate: 0.0916, over: 6500001 },
    { to: 40000000, primary: 1365321.84, rate: 0.0863, over: 13000001 }, { to: 130000000, primary: 3755421.23, rate: 0.0885, over: 40000001 },
    { to: 260000000, primary: 11717437.86, rate: 0.0828, over: 130000001 }, { to: 520000000, primary: 22475739.42, rate: 0.0808, over: 260000001 },
    { to: 1040000000, primary: 43501431.14, rate: 0.0787, over: 520000001 }, { to: Infinity, primary: 84483711.59, rate: 0.0728, over: 1040000001 },
];
export const ARC_MED: ArcBracket[] = [
    { to: 200000, primary: 13570.07, rate: 0.2096, over: 1 }, { to: 650000, primary: 55507.74, rate: 0.2016, over: 200001 },
    { to: 2000000, primary: 146200.15, rate: 0.1487, over: 650001 }, { to: 4000000, primary: 346886.84, rate: 0.1296, over: 2000001 },
    { to: 6500000, primary: 606078.35, rate: 0.1262, over: 4000001 }, { to: 13000000, primary: 921574.57, rate: 0.1095, over: 6500001 },
    { to: 40000000, primary: 1633552.23, rate: 0.1069, over: 13000001 }, { to: 130000000, primary: 4493209.33, rate: 0.1059, over: 40000001 },
    { to: 260000000, primary: 14019441.47, rate: 0.0991, over: 130000001 }, { to: 520000000, primary: 26891315.09, rate: 0.0968, over: 260000001 },
    { to: 1040000000, primary: 52047706.61, rate: 0.0943, over: 520000001 }, { to: Infinity, primary: 101081351.13, rate: 0.0871, over: 1040000001 },
];
export const ARC_HIGH: ArcBracket[] = [
    { to: 200000, primary: 15798.28, rate: 0.2441, over: 1 }, { to: 650000, primary: 64622.16, rate: 0.2347, over: 200001 },
    { to: 2000000, primary: 170206.35, rate: 0.1731, over: 650001 }, { to: 4000000, primary: 403845.93, rate: 0.1509, over: 2000001 },
    { to: 6500000, primary: 705596.52, rate: 0.1469, over: 4000001 }, { to: 13000000, primary: 1072897.87, rate: 0.1276, over: 6500001 },
    { to: 40000000, primary: 1901782.84, rate: 0.1233, over: 13000001 }, { to: 130000000, primary: 5230958.63, rate: 0.1239, over: 40000001 },
    { to: 260000000, primary: 16321445.09, rate: 0.1152, over: 130000001 }, { to: 520000000, primary: 31306890.75, rate: 0.1126, over: 260000001 },
    { to: 1040000000, primary: 60593982.1, rate: 0.1098, over: 520000001 }, { to: Infinity, primary: 117678990.65, rate: 0.1016, over: 1040000001 },
];


export const ROLE_LABEL: Record<RoleKey, string> = {
  director: 'Director', senior_architect: 'Senior Architect', architect: 'Architect',
  technologist: 'Technologist / Technician', junior: 'Junior / Intern', admin: 'Admin / Support',
};

// AECOM Rates Data
export const AECOM_RATES: AecomRateGroup[] = [
  { group: 'Offices', items: [
      { key: 'office_low_standard', label: 'Low-rise office (standard spec)', unit: 'm2', min: 11300, max: 13900 }, { key: 'office_low_prestige', label: 'Low-rise office (prestigious)', unit: 'm2', min: 14600, max: 21700 },
      { key: 'office_high_standard', label: 'High-rise office (standard spec)', unit: 'm2', min: 16400, max: 21700 }, { key: 'office_high_prestige', label: 'High-rise office (prestigious)', unit: 'm2', min: 21700, max: 27400 },
  ]},
  { group: 'Parking', items: [
      { key: 'parking_grade', label: 'Parking on grade (incl. landscaping)', unit: 'm2', min: 800, max: 1000 }, { key: 'parking_structured', label: 'Structured parking', unit: 'm2', min: 5550, max: 6100 },
      { key: 'parking_semi_basement', label: 'Parking in semi-basement', unit: 'm2', min: 6100, max: 8300 }, { key: 'parking_basement', label: 'Parking in basement', unit: 'm2', min: 6500, max: 11300 },
  ]},
  { group: 'Retail', items: [
      { key: 'retail_convenience', label: 'Local convenience centres (≤ 5,000m²)', unit: 'm2', min: 11100, max: 14600 }, { key: 'retail_neighbourhood', label: 'Neighbourhood centres (5,000–12,000m²)', unit: 'm2', min: 12100, max: 16100 },
      { key: 'retail_community', label: 'Community centres (12,000–25,000m²)', unit: 'm2', min: 13300, max: 17100 }, { key: 'retail_minor_regional', label: 'Minor regional centres (25,000–50,000m²)', unit: 'm2', min: 14100, max: 18100 },
      { key: 'retail_regional', label: 'Regional centres (50,000–100,000m²)', unit: 'm2', min: 15000, max: 18100 }, { key: 'retail_super_regional', label: 'Super regional centres (≥ 100,000m²)', unit: 'm2', min: 16400, max: 21000 },
  ]},
  { group: 'Industrial', items: [
      { key: 'industrial_steel_light', label: 'Steel frame + cladding (light-duty)', unit: 'm2', min: 5800, max: 7400 }, { key: 'industrial_steel_heavy', label: 'Steel frame + cladding (heavy-duty)', unit: 'm2', min: 6500, max: 9300 },
      { key: 'industrial_admin', label: 'Admin/offices, ablution and change rooms', unit: 'm2', min: 10500, max: 13400 }, { key: 'industrial_cold', label: 'Cold storage facilities', unit: 'm2', min: 19600, max: 27900 },
  ]},
  { group: 'Residential (site + mass housing)', items: [
      { key: 'res_site_low_cost', label: 'Site services to low-cost housing stand (250–350m²) (per site)', unit: 'site', min: 71000, max: 114000 }, { key: 'res_rdp', label: 'RDP housing', unit: 'm2', min: 3400, max: 3600 },
      { key: 'res_low_cost', label: 'Low-cost housing', unit: 'm2', min: 4300, max: 7400 }, { key: 'res_simple_lowrise_apart', label: 'Simple low-rise apartment block', unit: 'm2', min: 10300, max: 14300 },
      { key: 'res_duplex_economic', label: 'Duplex townhouse — economic', unit: 'm2', min: 10300, max: 14700 }, { key: 'res_prestige_apart', label: 'Prestige apartment block', unit: 'm2', min: 20000, max: 30000 },
  ]},
  { group: 'Private dwelling houses', items: [
      { key: 'house_economic', label: 'Economic', unit: 'm2', min: 7920, max: 7920 }, { key: 'house_standard', label: 'Standard', unit: 'm2', min: 9850, max: 9850 },
      { key: 'house_middle', label: 'Middle-class', unit: 'm2', min: 11830, max: 11830 }, { key: 'house_luxury', label: 'Luxury', unit: 'm2', min: 16350, max: 16350 },
      { key: 'house_exclusive', label: 'Exclusive', unit: 'm2', min: 26450, max: 26450 }, { key: 'house_exceptional', label: 'Exceptional (super luxury)', unit: 'm2', min: 38000, max: 80000 },
      { key: 'outbuildings_standard', label: 'Outbuildings — standard', unit: 'm2', min: 7400, max: 7400 }, { key: 'outbuildings_luxury', label: 'Outbuildings — luxury', unit: 'm2', min: 10400, max: 10400 },
      { key: 'carport_shaded_single', label: 'Carport (shaded) — single', unit: 'each', min: 6300, max: 6300 }, { key: 'carport_shaded_double', label: 'Carport (shaded) — double', unit: 'each', min: 12800, max: 12800 },
      { key: 'carport_covered_single', label: 'Carport (covered) — single', unit: 'each', min: 10000, max: 10000 }, { key: 'carport_covered_double', label: 'Carport (covered) — double', unit: 'each', min: 19500, max: 19500 },
      { key: 'pool_upto_50kl', label: 'Swimming pool ≤ 50 kl', unit: 'each', min: 135000, max: 135000 }, { key: 'pool_50_100kl', label: 'Swimming pool 50–100 kl', unit: 'each', min: 240000, max: 240000 },
      { key: 'tennis_court', label: 'Tennis court', unit: 'each', min: 710000, max: 710000 }, { key: 'tennis_floodlit', label: 'Tennis court — floodlit', unit: 'each', min: 880000, max: 880000 },
  ]},
  { group: 'Student residential', items: [{ key: 'student_highrise_standard', label: 'High rise tower block (standard spec)', unit: 'm2', min: 16000, max: 17500 },] },
  { group: 'Hotels (per key)', items: [
      { key: 'hotel_budget', label: 'Budget', unit: 'key', min: 890000, max: 1400000 }, { key: 'hotel_mid', label: 'Mid-scale (3-star)', unit: 'key', min: 1401000, max: 2100000 },
      { key: 'hotel_upper', label: 'Upper-scale (4-star)', unit: 'key', min: 2101000, max: 3000000 }, { key: 'hotel_luxury', label: 'Luxury (5-star)', unit: 'key', min: 3001000, max: 4000000 },
  ]},
  { group: 'Studios', items: [{ key: 'studio_dance_art', label: 'Studios — dancing, art exhibitions, etc.', unit: 'm2', min: 19500, max: 28000 },] },
  { group: 'Conference centres', items: [{ key: 'conf_international', label: 'Conference centre to international standards', unit: 'm2', min: 36000, max: 46000 },] },
  { group: 'Retirement centres', items: [
      { key: 'ret_house_middle', label: 'Dwelling houses — middle-class', unit: 'm2', min: 11600, max: 11600 }, { key: 'ret_house_luxury', label: 'Dwelling houses — luxury', unit: 'm2', min: 16400, max: 16400 },
      { key: 'ret_apartment_middle', label: 'Apartment block — middle-class', unit: 'm2', min: 12000, max: 12000 }, { key: 'ret_apartment_luxury', label: 'Apartment block — luxury', unit: 'm2', min: 18600, max: 18600 },
      { key: 'ret_community_centre', label: 'Community centre', unit: 'm2', min: 15800, max: 23000 }, { key: 'ret_frail_care', label: 'Frail care', unit: 'm2', min: 18600, max: 18600 },
  ]},
  { group: 'Schools', items: [
      { key: 'school_primary', label: 'Primary school', unit: 'm2', min: 9300, max: 10700 }, { key: 'school_secondary', label: 'Secondary school', unit: 'm2', min: 11100, max: 11900 },
  ]},
  { group: 'Hospitals', items: [{ key: 'hospital_district', label: 'District hospital', unit: 'm2', min: 39000, max: 39000 },] },
  { group: 'Stadiums', items: [
      { key: 'stadium_psl_seat', label: 'Stadium to PSL standards (per seat)', unit: 'seat', min: 48000, max: 74000 }, { key: 'stadium_fifa_seat', label: 'Stadium to FIFA standards (per seat)', unit: 'seat', min: 110000, max: 146000 },
      { key: 'stadium_pitch_fifa', label: 'Stadium pitch to FIFA standards (per pitch)', unit: 'pitch', min: 32000000, max: 37000000 },
  ]},
];

export function defaultRate(item: AecomRateItem): number {
  return Math.round((item.min + item.max) / 2);
}
