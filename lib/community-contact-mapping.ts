// Bridges the contact-card model (community_contacts row with name / role /
// address / phone / email) to the merge-tag registry (community_field_cache
// keyed by registry field_key). Manual edits in the contact card become
// `source='manual'` cache entries that win over future OCR fills.

export type ContactType = "insurance_agent" | "management_company";

export type ContactFieldKeys = {
  name: string;
  role: string;
  email: string;
  phone: string;
  address: string | null; // null = no corresponding registry entry
};

export const CONTACT_FIELD_KEYS: Record<ContactType, ContactFieldKeys> = {
  insurance_agent: {
    name: "insurance_agent_name",
    role: "insurance_agent_company",
    email: "insurance_agent_email",
    phone: "insurance_agent_phone",
    address: "insurance_agent_address",
  },
  management_company: {
    name: "management_contact_name",
    role: "management_company",
    email: "management_contact_email",
    phone: "management_contact_phone",
    address: null,
  },
};

// Flat list of every registry key any contact type could touch — handy when
// we need to fetch the cache rows for a community in one query.
export const ALL_CONTACT_REGISTRY_KEYS: string[] = Array.from(
  new Set(
    Object.values(CONTACT_FIELD_KEYS).flatMap((k) =>
      [k.name, k.role, k.email, k.phone, k.address].filter(
        (x): x is string => typeof x === "string"
      )
    )
  )
);
