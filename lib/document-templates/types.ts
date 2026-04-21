export type FieldType = "text" | "currency" | "date" | "textarea" | "boolean";

export type FieldDef = {
  key: string;
  label: string;
  section: string;
  type: FieldType;
  required: boolean;
  /** true = same for all units in a community, cached across orders */
  communityLevel: boolean;
  /** Maps to the key in OCR-extracted JSON */
  ocrFieldKey?: string;
};

export type DocumentTemplate = {
  key: string;
  title: string;
  sections: string[];
  fields: FieldDef[];
};
