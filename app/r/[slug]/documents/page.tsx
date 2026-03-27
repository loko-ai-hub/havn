"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import StepDocumentSelection from "@/components/requester/StepDocumentSelection";
import type { RequesterType } from "@/lib/portal-data";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

export default function RequesterDocumentsPage() {
  const portalOrg = usePortalOrg();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [requesterType] = useState<RequesterType>("homeowner");
  const [selected, setSelected] = useState<string[]>(["resale_cert"]);

  return (
    <div className="max-w-2xl mx-auto">
      <StepDocumentSelection
        requesterType={requesterType}
        selected={selected}
        primaryColor={primaryColor}
        onToggle={(docId) =>
          setSelected((prev) =>
            prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
          )
        }
        onBack={() => router.push(`/r/${slug}/property`)}
        onContinue={() => router.push(`/r/${slug}/addons`)}
      />
    </div>
  );
}
