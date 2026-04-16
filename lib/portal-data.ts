export type RequesterType = "homeowner" | "buyer_agent" | "lender_title";

export type RequesterTypeOption = {
  value: RequesterType;
  title: string;
  description: string;
};

export const REQUESTER_TYPES: RequesterTypeOption[] = [
  {
    value: "homeowner",
    title: "Homeowner",
    description: "I own the property being sold.",
  },
  {
    value: "buyer_agent",
    title: "Real Estate Agent",
    description: "I represent the buyer or seller in this transaction.",
  },
  {
    value: "lender_title",
    title: "Lender or Title Company",
    description: "I need documents for a loan or closing.",
  },
];

export type PortalDocument = {
  id: string;
  name: string;
  description: string;
  fee: number;
  required: boolean;
  availableTo: RequesterType[];
};

export const PORTAL_DOCUMENTS: PortalDocument[] = [
  {
    id: "resale_cert",
    name: "Resale Certificate",
    description: "Full certificate including financials, violations, and disclosures",
    fee: 250,
    required: false,
    availableTo: ["homeowner", "buyer_agent"],
  },
  {
    id: "resale_cert_update",
    name: "Certificate Update",
    description: "Updated certificate if one was issued within the last 6 months",
    fee: 75,
    required: false,
    availableTo: ["homeowner"],
  },
  {
    id: "lender_questionnaire",
    name: "Lender Questionnaire",
    description: "Required by most mortgage lenders for condo/HOA financing",
    fee: 150,
    required: false,
    availableTo: ["lender_title", "buyer_agent"],
  },
  {
    id: "estoppel",
    name: "Estoppel Letter",
    description: "Confirms current account balance and any amounts owed at closing",
    fee: 175,
    required: false,
    availableTo: ["buyer_agent"],
  },
  {
    id: "governing_docs",
    name: "Governing Documents",
    description: "CC&Rs, bylaws, rules and regulations",
    fee: 50,
    required: false,
    availableTo: ["lender_title"],
  },
  {
    id: "demand_letter",
    name: "Demand / Payoff Letter",
    description: "Payoff amount required to close or refinance",
    fee: 100,
    required: false,
    availableTo: ["lender_title"],
  },
];

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getDocumentFee(selectedIds: string[]): number {
  const selected = new Set(selectedIds);
  return PORTAL_DOCUMENTS.reduce((total, doc) => {
    if (!selected.has(doc.id)) return total;
    return total + doc.fee;
  }, 0);
}

export type PortalOrder = {
  requesterType: RequesterType;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  brokerageName: string;
  licenseNumber: string;
  mlsId: string;
  companyName: string;
  nmlsNumber: string;
  propertyAddress: string;
  unitNumber: string;
  city: string;
  state: string;
  zip: string;
  documentsSelected: string[];
  addOns: string[];
  deliveryType: string;
  closingDate: string;
  additionalEmails: string[];
  lenderFormChoice: string;
};

export type PortalAddon = {
  id: string;
  name: string;
  description: string;
  fee: number;
  popular?: boolean;
};

export const PORTAL_ADDONS: PortalAddon[] = [];

export const LENDER_ADDONS: PortalAddon[] = [
  {
    id: "hoa_violation_search",
    name: "HOA Violation Search",
    description: "Check for any open violations on the property",
    fee: 75,
  },
  {
    id: "lien_search",
    name: "Lien Search",
    description: "Search for any outstanding liens against the property",
    fee: 100,
  },
  {
    id: "financial_statements",
    name: "Financial Statements",
    description: "Detailed financial records for the association",
    fee: 125,
  },
  {
    id: "insurance_verification",
    name: "Insurance Verification",
    description: "Verify current insurance coverage and certificates",
    fee: 50,
  },
];

export const CUSTOM_FORM_FEE = 50;

export const STATE_LENDER_TEMPLATES: Record<string, { formName: string }> = {
  WA: { formName: "Washington Condo Questionnaire" },
  CA: { formName: "California HOA Questionnaire" },
  FL: { formName: "Florida Condo Questionnaire" },
};

export const KNOWN_LENDER_DOMAINS: Record<string, { formName: string }> = {
  "wellsfargo.com": { formName: "Wells Fargo Condo Questionnaire" },
  "chase.com": { formName: "Chase HOA Questionnaire" },
};

export const DELIVERY_OPTIONS = [
  { id: "standard", label: "Standard (5 business days)", fee: 0 },
  { id: "rush", label: "Rush (2 business days)", fee: 75 },
  { id: "rush_nextday", label: "Rush Next Day", fee: 125 },
  { id: "rush_sameday", label: "Rush Same Day", fee: 175 },
] as const;

export const HOMEOWNER_DELIVERY_OPTIONS = [
  { id: "standard", label: "Standard (5 business days)", fee: 0 },
  { id: "rush", label: "Rush (2 business days)", fee: 65 },
  { id: "rush_nextday", label: "Rush Next Day", fee: 100 },
] as const;

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

export function getDeliveryDate(deliveryType: string): Date {
  const today = new Date();
  if (deliveryType === "rush_sameday") return today;
  if (deliveryType === "rush_nextday") return addBusinessDays(today, 1);
  if (deliveryType === "rush") return addBusinessDays(today, 2);
  return addBusinessDays(today, 5);
}

export function getTotalFee(order: PortalOrder): number {
  const docsTotal = getDocumentFee(order.documentsSelected);
  const addonMap = new Map(
    [...PORTAL_ADDONS, ...LENDER_ADDONS].map((addon) => [addon.id, addon.fee])
  );
  const addonsTotal = order.addOns.reduce(
    (sum, id) => sum + (addonMap.get(id) ?? 0),
    0
  );
  const deliveryFee =
    [...DELIVERY_OPTIONS, ...HOMEOWNER_DELIVERY_OPTIONS].find(
      (option) => option.id === order.deliveryType
    )?.fee ?? 0;
  const lenderFormFee = order.lenderFormChoice === "custom" ? CUSTOM_FORM_FEE : 0;
  return docsTotal + addonsTotal + deliveryFee + lenderFormFee;
}
