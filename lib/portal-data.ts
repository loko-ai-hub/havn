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
    description: "I own or am selling a unit in this community",
  },
  {
    value: "buyer_agent",
    title: "Buyer's Agent",
    description: "I represent a buyer or am handling a real estate transaction",
  },
  {
    value: "lender_title",
    title: "Lender or Title Company",
    description: "I need documents for a loan or closing",
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
    availableTo: ["lender_title", "buyer_agent"],
  },
  {
    id: "governing_docs",
    name: "Governing Documents",
    description: "CC&Rs, bylaws, rules and regulations",
    fee: 50,
    required: false,
    availableTo: ["homeowner", "buyer_agent", "lender_title"],
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
