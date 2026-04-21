import type { FeeSaveRow } from "./actions";

export const DOC_ROWS: { key: FeeSaveRow["master_type_key"]; label: string; description: string }[] = [
  { key: "resale_certificate",   label: "Resale Certificate",   description: "Full HOA disclosure packet" },
  { key: "certificate_update",   label: "Certificate Update",   description: "Update to a prior certificate" },
  { key: "lender_questionnaire", label: "Lender Questionnaire", description: "Lender/mortgage info package" },
  { key: "demand_letter",        label: "Demand Letter",        description: "Account balance demand statement" },
];

export const DEFAULT_FEES: FeeSaveRow[] = [
  { master_type_key: "resale_certificate",   base_fee: 250, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "certificate_update",   base_fee: 75,  rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "lender_questionnaire", base_fee: 150, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
  { master_type_key: "demand_letter",        base_fee: 100, rush_same_day_fee: null, rush_next_day_fee: null, rush_3day_fee: null, standard_turnaround_days: 10 },
];

export const PRICING_DOC_TYPE_KEYS = DOC_ROWS.map((r) => r.key);
