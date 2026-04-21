import type { DocumentTemplate } from "./types";

export const LENDER_QUESTIONNAIRE: DocumentTemplate = {
  key: "lender_questionnaire",
  title: "Lender Questionnaire",
  sections: [
    "Association Information",
    "Management & Governance",
    "Financial Information",
    "Insurance & Compliance",
    "Property & Requester",
  ],
  fields: [
    // Association Information
    { key: "association_name", label: "Association Name", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "association_name" },
    { key: "association_type", label: "Association Type (HOA/COA)", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "association_type" },
    { key: "state", label: "State", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "state" },
    { key: "total_units", label: "Total Units", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "total_units" },
    { key: "tax_id", label: "Tax ID / EIN", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "tax_id" },
    { key: "fiscal_year_end", label: "Fiscal Year End", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "fiscal_year_end" },

    // Management & Governance
    { key: "management_company", label: "Management Company", section: "Management & Governance", type: "text", required: true, communityLevel: true, ocrFieldKey: "management_company" },
    { key: "management_contact_name", label: "Manager Contact Name", section: "Management & Governance", type: "text", required: false, communityLevel: true, ocrFieldKey: "management_contact_name" },
    { key: "management_contact_phone", label: "Manager Phone", section: "Management & Governance", type: "text", required: false, communityLevel: true, ocrFieldKey: "management_contact_phone" },
    { key: "management_contact_email", label: "Manager Email", section: "Management & Governance", type: "text", required: false, communityLevel: true, ocrFieldKey: "management_contact_email" },

    // Financial Information
    { key: "monthly_assessment", label: "Monthly Assessment", section: "Financial Information", type: "currency", required: true, communityLevel: false, ocrFieldKey: "monthly_assessment" },
    { key: "reserve_fund_balance", label: "Reserve Fund Balance", section: "Financial Information", type: "currency", required: true, communityLevel: true, ocrFieldKey: "reserve_fund_balance" },
    { key: "special_assessments", label: "Special Assessments", section: "Financial Information", type: "textarea", required: false, communityLevel: true, ocrFieldKey: "special_assessments" },
    { key: "delinquency_rate", label: "Delinquency Rate (% of units > 60 days)", section: "Financial Information", type: "text", required: false, communityLevel: true },
    { key: "pending_litigation", label: "Pending Litigation", section: "Financial Information", type: "textarea", required: false, communityLevel: true },
    { key: "budget_deficit", label: "Is the Association Operating at a Deficit?", section: "Financial Information", type: "boolean", required: false, communityLevel: true },

    // Insurance & Compliance
    { key: "insurance_company", label: "Insurance Company", section: "Insurance & Compliance", type: "text", required: true, communityLevel: true, ocrFieldKey: "insurance_company" },
    { key: "insurance_policy_number", label: "Policy Number", section: "Insurance & Compliance", type: "text", required: false, communityLevel: true, ocrFieldKey: "insurance_policy_number" },
    { key: "insurance_expiry", label: "Policy Expiration", section: "Insurance & Compliance", type: "date", required: false, communityLevel: true, ocrFieldKey: "insurance_expiry_date" },
    { key: "insurance_liability_amount", label: "Liability Coverage Amount", section: "Insurance & Compliance", type: "currency", required: false, communityLevel: true, ocrFieldKey: "insurance_liability_amount" },
    { key: "fha_va_approved", label: "FHA/VA Approved", section: "Insurance & Compliance", type: "boolean", required: false, communityLevel: true },
    { key: "fidelity_bond", label: "Fidelity Bond / Crime Coverage", section: "Insurance & Compliance", type: "boolean", required: false, communityLevel: true },

    // Property & Requester (order-specific)
    { key: "property_address", label: "Property Address", section: "Property & Requester", type: "text", required: true, communityLevel: false },
    { key: "unit_number", label: "Unit Number", section: "Property & Requester", type: "text", required: false, communityLevel: false },
    { key: "requester_name", label: "Requester Name", section: "Property & Requester", type: "text", required: true, communityLevel: false },
    { key: "requester_email", label: "Requester Email", section: "Property & Requester", type: "text", required: false, communityLevel: false },
    { key: "closing_date", label: "Closing Date", section: "Property & Requester", type: "date", required: false, communityLevel: false },
  ],
};
