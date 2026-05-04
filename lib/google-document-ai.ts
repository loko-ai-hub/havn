import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

export function createDocumentAIClient() {
  return new DocumentProcessorServiceClient({
    credentials: {
      client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL!,
      private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    },
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  });
}

export const PROCESSOR_NAME = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.GOOGLE_CLOUD_PROCESSOR_LOCATION}/processors/${process.env.GOOGLE_CLOUD_PROCESSOR_ID}`;

/**
 * Form Parser is a separate Document AI processor that returns explicit
 * formFields[] with bounding boxes for both the field name and its blank
 * value cell. Configured via GOOGLE_CLOUD_FORM_PROCESSOR_ID; falls back
 * to null (so callers can degrade gracefully) when not set.
 */
export const FORM_PROCESSOR_NAME: string | null = process.env
  .GOOGLE_CLOUD_FORM_PROCESSOR_ID
  ? `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.GOOGLE_CLOUD_PROCESSOR_LOCATION}/processors/${process.env.GOOGLE_CLOUD_FORM_PROCESSOR_ID}`
  : null;
