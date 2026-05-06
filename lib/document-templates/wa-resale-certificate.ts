import type { DocumentTemplate } from "./types";


// TODO — before this template ships, add these registry fields in
// lib/document-templates/field-registry.ts:
//   transfer_fee (currency) — Resale/Transfer Certificate Preparation Fee
//     RCW 64.34.425(3) authorizes a reasonable fee for preparation of the resale certificate, charged to the selling unit owner. RCW 64.90.640 provides the parallel WUCIOA fee structure. Amount should be disclosed on the certificate.
//   working_capital_contribution (currency) — Working Capital / Initiation Contribution at Closing
//     Commonly required contribution to association capital at resale closing; not captured by assessment or special_assessments.
//   capital_expenditures_planned (textarea) — Approved Capital Expenditures (current & next fiscal year)
//     Expressly required disclosure under RCW 64.34.425(1)(d); no existing registry field captures planned capital expenditures.
//   reserve_study_date (date) — Date of Most Recent Reserve Study
//     RCW 64.34.425(1)(m) and RCW 64.34.380-.382 require disclosure of the date of the most recent reserve study on the face of the certificate.
//   reserve_study_funded_percent (text) — Reserve Study Percent Funded
//     RCW 64.34.425(1)(m) requires percent-funded to appear on the certificate itself.
//   reserve_recommended_contribution (currency) — Recommended Reserve Contribution Rate
//     RCW 64.34.425(1)(m) requires disclosure of the recommended reserve contribution rate on the certificate.
//   capital_reserve_designations (textarea) — Designated Reserve Projects
//     RCW 64.34.425(1)(e) requires disclosure of portions of reserves designated for specified projects.
//   leasehold_remaining_term (text) — Remaining Term of Leasehold (if applicable)
//     RCW 64.34.425(1)(k) requires disclosure of any leasehold estate affecting the condominium.
//   declaration_violations (textarea) — Known Declaration/Use Violations for Unit
//     RCW 64.34.425(1)(j) requires statement of known violations in or to the unit or its limited common elements.
//   unpaid_assessments_amount (currency) — Unpaid Assessments Owed by Seller
//     RCW 64.34.425(1)(b) specifically requires the dollar amount of unpaid common expense or special assessments due from the selling owner.
//   other_fees_payable (textarea) — Other Fees Payable by Unit Owners
//     RCW 64.34.425(1)(c) requires disclosure of any other fees payable by unit owners – distinct from liens.
//   pledged_assets (textarea) — Association Assets Pledged as Collateral
//     RCW 64.34.425(1)(l) requires a statement of any assets of the association that have been pledged as collateral. Currently missing from the draft.
//   right_of_first_refusal (textarea) — Right of First Refusal / Restraint on Alienability
//     RCW 64.34.425(1)(a) requires disclosure of the effect on the proposed disposition of any right of first refusal or other restraint on free alienability.
//   assessment_frequency (text) — Assessment Frequency
//     Needed to interpret assessment (some WA associations bill quarterly or annually).
//   signer_title (text) — Signer Title
//     Required to substantiate authority of signer on behalf of association.
//   signer_capacity (text) — Signer Capacity (Officer / Director / Managing Agent)
//     RCW 64.34.425 and RCW 64.90.640 contemplate execution by the association or its authorized agent; capacity must be disclosed.
//   signature (text) — Signature
//     Needed to implement requiresSignature=true. Notarization is not statutorily required and should not be added.
//   execution_date (date) — Date of Execution
//     Execution date is required to anchor the signature; distinct from certificate issue date if different.
//   wucioa_buyer_notice (textarea) — WUCIOA Buyer Notice / Five-Day Cancellation Statement
//     RCW 64.90.640(3) requires WUCIOA certificates to contain a notice of the purchaser's five-day cancellation right.
//   adr_statement (textarea) — Alternative Dispute Resolution Statement (WUCIOA)
//     RCW 64.90.640 requires a statement regarding alternative dispute resolution obligations for WUCIOA communities.
//
// Already added to the registry:
//   certificate_preparer_name — auto-populated from the signature block at render.
//   certificate_issue_date   — auto-populated from signature.signedAt (or generation time).

const COVER_LETTER_BODY = `Date: {{certificate_issue_date}}

To: {{requester_name}}
{{requester_email}}

RE: Condominium Resale Certificate & Disclosures

Property Address: {{property_address}}
Seller(s): {{seller_name}}
Buyer(s): {{buyer_name}}

Dear {{requester_name}},

Enclosed please find the completed Condominium Resale Certificate and all required governing documents and financial exhibits for the property referenced above. This package has been prepared by {{management_company}} on behalf of the {{association_name}}.

Please review the enclosed documents carefully. Note the following important statutory guidelines regarding this Resale Certificate:

Validity: This resale certificate is valid for thirty (30) days from the date of issuance.

Review Period: The purchaser's contract is voidable by the purchaser until the certificate has been provided and for five days thereafter or until conveyance, whichever occurs first.

Liability: The information furnished is based on the books and records of the association and the actual knowledge of the preparer. A buyer is not liable for any unpaid assessment or fee against the unit greater than the amount set forth in the certificate, unless the buyer had actual knowledge of a greater amount or the amount was assessed after the date of this certificate.

Enclosed Documents Checklist:
- Completed and Signed {{management_company}} Resale Certificate
- Exhibit A: Owner Balance Sheet & Expected Assessments under current budget horizon
- Exhibit B: Condominium declaration, and any amendments thereto, showing recording numbers
- Exhibit C: Condominium bylaws, and any amendments thereto
- Exhibit D: Condominium rules and regulations, and any amendments thereto
- Exhibit E: Annual financial statement of the association, including the audit report if it has been prepared, for the year immediately preceding the current year
- Exhibit F: A balance sheet and revenue and expense statement of the association, prepared on an accrual basis, which shall be current to within 120 days
- Exhibit G: Current operating budget of the association
- Exhibit H: Association current reserve study
- Exhibit I: Association & Board Meeting Minutes (Preceding 12 Months)
- Exhibit J: Certificate of Insurance (COI) for the Association's Master Policy

If you have any questions regarding the financials, fees, or disclosures provided in this certificate, please do not hesitate to contact our office at {{management_contact_phone}} or {{management_contact_email}}.

Thank you for your time and cooperation in facilitating this transfer.

Sincerely,

{{certificate_preparer_name}}
{{signer_title}}
{{management_company}}`;

export const WA_RESALE_CERTIFICATE: DocumentTemplate = {
  key: "resale_certificate",
  state: "WA",
  documentType: "resale_certificate",
  title: "Washington Resale Certificate",
  statute: "RCW 64.34.425 (condominiums created after July 1, 1990); RCW 64.90.640 (common interest communities created on or after July 1, 2018 - WUCIOA); RCW 64.38.045 (homeowners' associations)",
  expirationDays: 30,
  requiresSignature: true,
  lastUpdated: "2026-04-24",
  coverLetter: {
    enabled: true,
    template: COVER_LETTER_BODY,
  },
  legalLanguage: {
    statuteReference: "RCW 64.34.425 (condominiums created after July 1, 1990); RCW 64.90.640 (common interest communities created on or after July 1, 2018 - WUCIOA); RCW 64.38.045 (homeowners' associations)",
    certificationText: `The undersigned, on behalf of {{association_name}}, certifies pursuant to RCW 64.34.425 (and/or RCW 64.90.640 or RCW 64.38.045, as applicable based on the association type) that the information contained in this Resale Certificate regarding the unit located at {{property_address}} is true and correct to the best of the association's knowledge as of the issue date set forth below. This certificate is prepared at the request of {{requester_name}} in anticipation of the sale of the unit. Pursuant to RCW 64.34.425(4) (and the parallel provisions of RCW 64.90.640 and RCW 64.38.045(3)), the association, its officers, directors, employees, and managing agent ({{management_company}}) have no liability to the purchaser for any erroneous information provided by the selling unit owner and included in this certificate. Executed by {{certificate_preparer_name}} in the capacity indicated below on {{certificate_issue_date}}.`,
    disclaimerText: `This Resale Certificate is issued pursuant to Washington law: RCW 64.34.425 for condominiums created after July 1, 1990; RCW 64.90.640 for common interest communities created on or after July 1, 2018 (WUCIOA); and RCW 64.38.045 for homeowners' associations. A purchaser is not liable for any unpaid assessment or fee greater than the amount set forth in this certificate prepared by the association. Under RCW 64.34.425(2) (and the parallel provisions of RCW 64.90.640(3) and RCW 64.38.045), a unit owner is not liable to the purchaser for the failure or delay of the association to provide the certificate in a timely manner, but the purchase and sale contract is voidable by the purchaser until the certificate has been provided and for five days thereafter or until conveyance, whichever occurs first. This certificate does not have a statutory expiration date; however, the purchaser's five-day cancellation right runs from delivery of the certificate.`,
    requiredDisclosures: [
      `Condo (RCW 64.34.425(1)(a)): The effect on the proposed disposition of any right of first refusal or other restraint on the free alienability of the unit.`,
      `Condo (RCW 64.34.425(1)(b)): Statement of the amount of any unpaid common expense or special assessments currently due and payable from the selling unit owner.`,
      `Condo (RCW 64.34.425(1)(c)): Statement of any other fees payable by unit owners.`,
      `Condo (RCW 64.34.425(1)(d)): Statement of any capital expenditures approved by the association for the current and succeeding fiscal year.`,
      `Condo (RCW 64.34.425(1)(e)): Statement of the amount of any reserves for capital expenditures and of any portions of those reserves designated by the association for any specified projects.`,
      `Condo (RCW 64.34.425(1)(f)): The most recent regularly prepared balance sheet and income and expense statement, if any, of the association.`,
      `Condo (RCW 64.34.425(1)(g)): The current operating budget of the association.`,
      `Condo (RCW 64.34.425(1)(h)): Statement of any unsatisfied judgments against the association and the status of any pending suits in which the association is a defendant or plaintiff.`,
      `Condo (RCW 64.34.425(1)(i)): Statement describing any insurance coverage provided for the benefit of unit owners.`,
      `Condo (RCW 64.34.425(1)(j)): Statement as to whether the board of directors has given or received notice that any existing uses, occupancies, alterations, or improvements in or to the unit or to the limited common elements assigned thereto violate any provision of the declaration.`,
      `Condo (RCW 64.34.425(1)(k)): Statement of the remaining term of any leasehold estate affecting the condominium and the provisions governing any extension or renewal thereof.`,
      `Condo (RCW 64.34.425(1)(l)): Statement of any assets of the association that have been pledged as collateral.`,
      `Condo (RCW 64.34.425(1)(m)): Reserve study disclosure, including the current reserve account balance, the recommended reserve contribution rate, the percent funded, and the date of the most recent reserve study (this disclosure must appear on the certificate itself, not merely by attachment).`,
      `Condo attachments (RCW 64.34.425(1)): A copy of the declaration, bylaws, rules and regulations, and any amendments thereto.`,
      `WUCIOA (RCW 64.90.640): For common interest communities created on or after July 1, 2018, include all content items enumerated in RCW 64.90.640, including statements regarding transfer restrictions/rights of first refusal, alternative dispute resolution, insurance, reserves and reserve study, pending litigation, unpaid assessments and fees, and the WUCIOA-mandated buyer notice of the five-day cancellation right under RCW 64.90.640(3).`,
      `HOA (RCW 64.38.045(1)(a)-(h)): For homeowners' associations, disclose the statement of assessments and unpaid amounts, reserves and reserve study information, insurance coverage, pending litigation and unsatisfied judgments, any other fees payable, and any other information required by RCW 64.38.045. The association must deliver within 10 days of request per RCW 64.38.045(3).`,
    ],
  },
  disclaimer: `This Resale Certificate is issued pursuant to Washington law: RCW 64.34.425 for condominiums created after July 1, 1990; RCW 64.90.640 for common interest communities created on or after July 1, 2018 (WUCIOA); and RCW 64.38.045 for homeowners' associations. A purchaser is not liable for any unpaid assessment or fee greater than the amount set forth in this certificate prepared by the association. Under RCW 64.34.425(2) (and the parallel provisions of RCW 64.90.640(3) and RCW 64.38.045), a unit owner is not liable to the purchaser for the failure or delay of the association to provide the certificate in a timely manner, but the purchase and sale contract is voidable by the purchaser until the certificate has been provided and for five days thereafter or until conveyance, whichever occurs first. This certificate does not have a statutory expiration date; however, the purchaser's five-day cancellation right runs from delivery of the certificate.`,
  attachments: {
    enabled: true,
    order: "as_listed",
    categories: [
      "Declaration and amendments",
      "Bylaws and amendments",
      "Rules and regulations",
      "Articles of incorporation",
      "Current operating budget",
      "Most recent balance sheet and income/expense statement",
      "Reserve study (most recent) – attachment supplements but does not substitute for the (1)(m) disclosure on the face of the certificate",
      "Certificate of insurance",
      "Meeting minutes (most recent annual and board)",
      "WUCIOA buyer notice (for RCW 64.90.640 communities)",
    ],
  },
  sections: ["Association Information", "Property Information", "Financial Information", "Reserve Study Disclosure", "Insurance", "Restrictions & Governance", "Litigation, Liens & Pledged Assets", "Certification"],
  fields: [
    {
      key: "association_name",
      mergeTag: "{{association_name}}",
      label: "Association Name",
      section: "Association Information",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "association_name",
    },
    {
      key: "association_type",
      mergeTag: "{{association_type}}",
      label: "Association Type",
      section: "Association Information",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "association_type",
    },
    {
      key: "state",
      mergeTag: "{{state}}",
      label: "State",
      section: "Association Information",
      type: "text",
      required: true,
      communityLevel: true,
    },
    {
      key: "county",
      mergeTag: "{{county}}",
      label: "County",
      section: "Association Information",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "county",
    },
    {
      key: "total_units",
      mergeTag: "{{total_units}}",
      label: "Total Units",
      section: "Association Information",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "total_units",
    },
    {
      key: "fiscal_year_end",
      mergeTag: "{{fiscal_year_end}}",
      label: "Fiscal Year End",
      section: "Association Information",
      type: "text",
      required: false,
      communityLevel: true,
      ocrFieldKey: "fiscal_year_end",
    },
    {
      key: "mailing_address",
      mergeTag: "{{mailing_address}}",
      label: "Mailing Address",
      section: "Association Information",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "mailing_address",
    },
    {
      key: "website",
      mergeTag: "{{website}}",
      label: "Website",
      section: "Association Information",
      type: "text",
      required: false,
      communityLevel: true,
      ocrFieldKey: "website",
    },
    {
      key: "management_company",
      mergeTag: "{{management_company}}",
      label: "Management Company",
      section: "Association Information",
      type: "text",
      required: false,
      communityLevel: true,
    },
    {
      key: "management_contact_name",
      mergeTag: "{{management_contact_name}}",
      label: "Manager Contact Name",
      section: "Association Information",
      type: "text",
      required: false,
      communityLevel: true,
      ocrFieldKey: "management_contact_name",
    },
    {
      key: "management_contact_email",
      mergeTag: "{{management_contact_email}}",
      label: "Manager Email",
      section: "Association Information",
      type: "text",
      required: false,
      communityLevel: true,
      ocrFieldKey: "management_contact_email",
    },
    {
      key: "management_contact_phone",
      mergeTag: "{{management_contact_phone}}",
      label: "Manager Phone",
      section: "Association Information",
      type: "text",
      required: false,
      communityLevel: true,
      ocrFieldKey: "management_contact_phone",
    },
    {
      key: "property_address",
      mergeTag: "{{property_address}}",
      label: "Property Address",
      section: "Property Information",
      type: "text",
      required: true,
      communityLevel: false,
    },
    {
      key: "unit_number",
      mergeTag: "{{unit_number}}",
      label: "Unit Number",
      section: "Property Information",
      type: "text",
      required: true,
      communityLevel: false,
    },
    {
      key: "requester_name",
      mergeTag: "{{requester_name}}",
      label: "Requester Name",
      section: "Property Information",
      type: "text",
      required: true,
      communityLevel: false,
    },
    {
      key: "seller_name",
      mergeTag: "{{seller_name}}",
      label: "Seller(s)",
      section: "Property Information",
      type: "text",
      required: true,
      communityLevel: false,
      helpText: "Name(s) of the current unit owner(s) selling the property.",
    },
    {
      key: "buyer_name",
      mergeTag: "{{buyer_name}}",
      label: "Buyer(s)",
      section: "Property Information",
      type: "text",
      required: false,
      communityLevel: false,
      helpText: "Leave blank to default to the requester's name on the cover letter.",
    },
    {
      key: "requester_email",
      mergeTag: "{{requester_email}}",
      label: "Requester Email",
      section: "Property Information",
      type: "text",
      required: false,
      communityLevel: false,
    },
    {
      key: "closing_date",
      mergeTag: "{{closing_date}}",
      label: "Closing Date",
      section: "Property Information",
      type: "date",
      required: false,
      communityLevel: false,
    },
    {
      key: "assessment",
      mergeTag: "{{assessment}}",
      label: "HOA Dues Amount",
      section: "Financial Information",
      type: "currency",
      required: true,
      communityLevel: false,
      ocrFieldKey: "assessment",
    },
    {
      key: "special_assessments",
      mergeTag: "{{special_assessments}}",
      label: "Special Assessments",
      section: "Financial Information",
      type: "textarea",
      required: true,
      communityLevel: true,
      ocrFieldKey: "special_assessments",
    },
    {
      key: "reserve_fund_balance",
      mergeTag: "{{reserve_fund_balance}}",
      label: "Reserve Fund Balance",
      section: "Reserve Study Disclosure",
      type: "currency",
      required: true,
      communityLevel: true,
      ocrFieldKey: "reserve_fund_balance",
    },
    {
      key: "delinquency_rate",
      mergeTag: "{{delinquency_rate}}",
      label: "Delinquency Rate",
      section: "Financial Information",
      type: "text",
      required: false,
      communityLevel: true,
    },
    {
      key: "budget_deficit",
      mergeTag: "{{budget_deficit}}",
      label: "Operating at a Deficit",
      section: "Financial Information",
      type: "boolean",
      required: false,
      communityLevel: true,
    },
    {
      key: "insurance_company",
      mergeTag: "{{insurance_company}}",
      label: "Insurance Company",
      section: "Insurance",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "insurance_company",
    },
    {
      key: "insurance_policy_number",
      mergeTag: "{{insurance_policy_number}}",
      label: "Policy Number",
      section: "Insurance",
      type: "text",
      required: true,
      communityLevel: true,
      ocrFieldKey: "insurance_policy_number",
    },
    {
      key: "insurance_expiry",
      mergeTag: "{{insurance_expiry}}",
      label: "Policy Expiration",
      section: "Insurance",
      type: "date",
      required: true,
      communityLevel: true,
      ocrFieldKey: "insurance_expiry_date",
    },
    {
      key: "insurance_liability_amount",
      mergeTag: "{{insurance_liability_amount}}",
      label: "Liability Coverage Amount",
      section: "Insurance",
      type: "currency",
      required: true,
      communityLevel: true,
      ocrFieldKey: "insurance_liability_amount",
    },
    {
      key: "fha_va_approved",
      mergeTag: "{{fha_va_approved}}",
      label: "FHA/VA Approved",
      section: "Insurance",
      type: "boolean",
      required: false,
      communityLevel: true,
    },
    {
      key: "fidelity_bond",
      mergeTag: "{{fidelity_bond}}",
      label: "Fidelity Bond / Crime Coverage",
      section: "Insurance",
      type: "boolean",
      required: false,
      communityLevel: true,
    },
    {
      key: "pet_restrictions",
      mergeTag: "{{pet_restrictions}}",
      label: "Pet Restrictions",
      section: "Restrictions & Governance",
      type: "textarea",
      required: false,
      communityLevel: true,
      ocrFieldKey: "pet_restrictions",
    },
    {
      key: "rental_restrictions",
      mergeTag: "{{rental_restrictions}}",
      label: "Rental Restrictions",
      section: "Restrictions & Governance",
      type: "textarea",
      required: false,
      communityLevel: true,
      ocrFieldKey: "rental_restrictions",
    },
    {
      key: "parking_restrictions",
      mergeTag: "{{parking_restrictions}}",
      label: "Parking Restrictions",
      section: "Restrictions & Governance",
      type: "textarea",
      required: false,
      communityLevel: true,
      ocrFieldKey: "parking_restrictions",
    },
    {
      key: "pending_litigation",
      mergeTag: "{{pending_litigation}}",
      label: "Pending Litigation",
      section: "Litigation, Liens & Pledged Assets",
      type: "textarea",
      required: true,
      communityLevel: true,
    },
    {
      key: "statute",
      mergeTag: "{{statute}}",
      label: "Statute",
      section: "Certification",
      type: "text",
      required: true,
      communityLevel: true,
    },
  ],
};

// After committing this file:
//   1. Import it in lib/document-templates/index.ts
//   2. Call registerStateTemplate(WA_RESALE_CERTIFICATE) alongside the existing templates
