export type StateDocDef = {
  abbr: string;
  state: string;
  localName: string;
  capType: "fixed" | "actual_cost";
  limit?: string;
  deliveryDays?: string;
  statute: string;
};

export const RESALE_DEFS: StateDocDef[] = [];
export const DEMAND_DEFS: StateDocDef[] = [];
export const UPDATE_DEFS: StateDocDef[] = [];
export const LENDER_DEFS: StateDocDef[] = [];
export const RUSH_DEFS: StateDocDef[] = [];

export const getLocalizedLabel = (abbr: string, fallback: string) => {
  void abbr;
  return fallback;
};

export const filterByStates = (defs: StateDocDef[], states: string[]): StateDocDef[] =>
  defs.filter((def) => states.includes(def.abbr));
