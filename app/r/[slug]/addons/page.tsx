"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import StepAddons from "@/components/requester/StepAddons";
import { PORTAL_ADDONS } from "@/lib/portal-data";

export default function RequesterAddonsPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const handleToggle = (id: string) => {
    setSelectedAddons((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  return (
    <StepAddons
      selected={selectedAddons}
      primaryColor="#1B2B4B"
      onToggle={handleToggle}
      addOnsList={PORTAL_ADDONS}
      documentTotal={250}
      onBack={() => router.push(`/r/${slug}/documents`)}
      onContinue={() => router.push(`/r/${slug}/delivery`)}
    />
  );
}
