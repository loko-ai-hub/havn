import type { DocumentTemplate } from "./types";

export const RESALE_CERTIFICATE: DocumentTemplate = {
  key: "resale_certificate",
  title: "Resale Certificate",
  sections: [
    "Association Information",
    "Management & Governance",
    "Financial Information",
    "Insurance",
    "Restrictions & Rules",
    "Property & Requester",
  ],
  fields: [
    // Association Information
    { key: "association_name", label: "Association Name", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "association_name" },
    { key: "association_type", label: "Association Type (HOA/COA)", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "association_type" },
    { key: "state", label: "State", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "state" },
    { key: "county", label: "County", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "county" },
    { key: "total_units", label: "Total Units", section: "Association Information", type: "text", required: true, communityLevel: true, ocrFieldKey: "total_units" },
    { key: "tax_id", label: "Tax ID / EIN", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "tax_id" },
    { key: "fiscal_year_end", label: "Fiscal Year End", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "fiscal_year_end" },
    { key: "mailing_address", label: "Mailing Address", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "mailing_address" },
    { key: "website", label: "Website", section: "Association Information", type: "text", required: false, communityLevel: true, ocrFieldKey: "website" },

    // Management & Governance
    { key: "management_company", label: "Management Company", section: "Management & Governance", type: "text", required: true, communityLevel: true, ocrFieldKey: "management_company" },
    { key: "management_contact_name", label: "Manager Contact Name", section: "Management & Governance", type: "text", required: false, communityLevel: true, ocrFieldKey: "management_contact_name" },
    { key: "management_contact_email", label: "Manager Email", section: "Management & Governance", type: "text", required: false, communityLevel: true, ocrFieldKey: "management_contact_email" },
    { key: "management_contact_phone", label: "Manager Phone", section: "Management & Governance", type: "text", required: false, communityLevel: true, ocrFieldKey: "management_contact_phone" },

    // Financial Information
    { key: "assessment", label: "HOA Dues Amount", section: "Financial Information", type: "currency", required: true, communityLevel: false, ocrFieldKey: "assessment" },
    { key: "special_assessments", label: "Special Assessments", section: "Financial Information", type: "textarea", required: false, communityLevel: true, ocrFieldKey: "special_assessments" },
    { key: "reserve_fund_balance", label: "Reserve Fund Balance", section: "Financial Information", type: "currency", required: true, communityLevel: true, ocrFieldKey: "reserve_fund_balance" },
    { key: "outstanding_liens", label: "Outstanding Liens on Unit", section: "Financial Information", type: "textarea", required: false, communityLevel: false },
    { key: "pending_litigation", label: "Pending Litigation", section: "Financial Information", type: "textarea", required: false, communityLevel: true },

    // Insurance
    { key: "insurance_company", label: "Insurance Company", section: "Insurance", type: "text", required: false, communityLevel: true, ocrFieldKey: "insurance_company" },
    { key: "insurance_policy_number", label: "Policy Number", section: "Insurance", type: "text", required: false, communityLevel: true, ocrFieldKey: "insurance_policy_number" },
    { key: "insurance_expiry", label: "Policy Expiration", section: "Insurance", type: "date", required: false, communityLevel: true, ocrFieldKey: "insurance_expiry_date" },
    { key: "insurance_liability_amount", label: "Liability Coverage Amount", section: "Insurance", type: "currency", required: false, communityLevel: true, ocrFieldKey: "insurance_liability_amount" },

    // Restrictions & Rules
    { key: "pet_restrictions", label: "Pet Restrictions", section: "Restrictions & Rules", type: "textarea", required: false, communityLevel: true, ocrFieldKey: "pet_restrictions" },
    { key: "rental_restrictions", label: "Rental Restrictions", section: "Restrictions & Rules", type: "textarea", required: false, communityLevel: true, ocrFieldKey: "rental_restrictions" },
    { key: "parking_restrictions", label: "Parking Restrictions", section: "Restrictions & Rules", type: "textarea", required: false, communityLevel: true, ocrFieldKey: "parking_restrictions" },

    // Property & Requester (order-specific)
    { key: "property_address", label: "Property Address", section: "Property & Requester", type: "text", required: true, communityLevel: false },
    { key: "unit_number", label: "Unit Number", section: "Property & Requester", type: "text", required: false, communityLevel: false },
    { key: "requester_name", label: "Requester Name", section: "Property & Requester", type: "text", required: true, communityLevel: false },
    { key: "requester_email", label: "Requester Email", section: "Property & Requester", type: "text", required: false, communityLevel: false },
    { key: "closing_date", label: "Closing Date", section: "Property & Requester", type: "date", required: false, communityLevel: false },
  ],
};
