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
