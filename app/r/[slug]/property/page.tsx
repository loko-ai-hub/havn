"use client";

import { useParams } from "next/navigation";

import StepPropertyAddress from "@/components/requester/StepPropertyAddress";

export default function RequesterPropertyPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  return <StepPropertyAddress slug={slug} />;
}
