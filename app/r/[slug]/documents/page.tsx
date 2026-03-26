"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

import StepDocumentSelection from "@/components/requester/StepDocumentSelection";
import type { RequesterType } from "@/lib/portal-data";

export default function RequesterDocumentsPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [requesterType] = useState<RequesterType>("homeowner");
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  return (
    <StepDocumentSelection
      slug={slug}
      requesterType={requesterType}
      selectedDocumentIds={selectedDocuments}
      onChangeSelectedDocumentIds={setSelectedDocuments}
    />
  );
}
