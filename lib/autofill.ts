function f(fields: Record<string, string | null>, key: string): string | null {
  const v = fields[key];
  return v === undefined ? null : v;
}

export function mapFieldsToDocument(
  fields: Record<string, string | null>,
  documentType: string
): Record<string, string | null> {
  const base = {
    "Association Name": f(fields, "association_name"),
    "Association Type": f(fields, "association_type"),
    State: f(fields, "state"),
    "Management Company": f(fields, "management_company"),
    "Management Contact": f(fields, "management_contact_name"),
    "Management Email": f(fields, "management_contact_email"),
    "Management Phone": f(fields, "management_contact_phone"),
    "Total Units": f(fields, "total_units"),
    "Tax ID": f(fields, "tax_id"),
    "Fiscal Year End": f(fields, "fiscal_year_end"),
    Website: f(fields, "website"),
    "Mailing Address": f(fields, "mailing_address"),
  };

  if (documentType === "resale_certificate") {
    return {
      ...base,
      "Monthly Assessment": f(fields, "monthly_assessment"),
      "Special Assessments": f(fields, "special_assessments"),
      "Reserve Fund Balance": f(fields, "reserve_fund_balance"),
      "Pet Restrictions": f(fields, "pet_restrictions"),
      "Rental Restrictions": f(fields, "rental_restrictions"),
      "Parking Restrictions": f(fields, "parking_restrictions"),
    };
  }

  if (documentType === "lender_questionnaire") {
    return {
      ...base,
      "Insurance Company": f(fields, "insurance_company"),
      "Insurance Policy Number": f(fields, "insurance_policy_number"),
      "Insurance Expiry": f(fields, "insurance_expiry_date"),
      "Liability Amount": f(fields, "insurance_liability_amount"),
      "Reserve Fund Balance": f(fields, "reserve_fund_balance"),
      "Monthly Assessment": f(fields, "monthly_assessment"),
    };
  }

  return base;
}
