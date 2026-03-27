"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import StepDocumentSelection from "@/components/requester/StepDocumentSelection";
import {
  usePortalOrg,
  usePortalOrder,
} from "@/components/requester/RequesterPortalOrgContext";

const RESALE_IDS = ["resale_cert", "resale_cert_update"];
const LENDER_IDS = ["lender_questionnaire", "custom_company_form"];

export default function RequesterDocumentsPage() {
  const portalOrg = usePortalOrg();
  const { order, updateOrder } = usePortalOrder();
  const primaryColor = portalOrg?.brandColor ?? "#1B2B4B";
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const requesterType = order.requesterType ?? "homeowner";
  const initialSelected = useMemo(() => {
    if (requesterType === "lender_title") {
      return order.documentsSelected.length > 0 &&
        order.documentsSelected.some(
          (id) => id === "lender_questionnaire" || id === "custom_company_form"
        )
        ? order.documentsSelected
        : ["lender_questionnaire"];
    }
    return order.documentsSelected;
  }, [order.documentsSelected, requesterType]);
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const updateOrderRef = useRef(updateOrder);

  useEffect(() => {
    updateOrderRef.current = updateOrder;
  }, [updateOrder]);

  useEffect(() => {
    if (requesterType === "lender_title") {
      const lenderSelected = selected.filter((id) => LENDER_IDS.includes(id));
      if (lenderSelected.length !== 1) {
        setSelected(["lender_questionnaire"]);
      }
    }
  }, [requesterType, selected]);

  useEffect(() => {
    const current = order.documentsSelected;
    const isSame =
      current.length === selected.length &&
      current.every((value, index) => value === selected[index]);
    if (!isSame) {
      updateOrderRef.current({ documentsSelected: selected });
    }
  }, [selected, order.documentsSelected]);

  return (
    <div className="max-w-2xl mx-auto">
      <StepDocumentSelection
        requesterType={requesterType}
        selected={selected}
        primaryColor={primaryColor}
        onToggle={(docId) => {
          setSelected((prev) => {
            if (requesterType === "lender_title") {
              return [docId];
            }
            if (requesterType === "homeowner" && RESALE_IDS.includes(docId)) {
              const withoutResale = prev.filter((id) => !RESALE_IDS.includes(id));
              return [...withoutResale, docId];
            }
            return prev.includes(docId)
              ? prev.filter((id) => id !== docId)
              : [...prev, docId];
          });
        }}
        onBack={() => router.push(`/r/${slug}/property`)}
        onContinue={() => router.push(`/r/${slug}/addons`)}
      />
    </div>
  );
}
