"use client";

import { ArrowLeft, Save } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  saveCanonicalFormTemplate,
  type FormTemplateEditorData,
} from "../../form-templates-actions";

// Reuse the existing PdfOverlay from the dashboard review page.
// It's a client component (pdfjs worker), so dynamic-load to keep
// it out of SSR.
const PdfOverlay = dynamic(
  () => import("@/app/dashboard/requests/[orderId]/review/pdf-overlay"),
  { ssr: false }
);

type BboxOverride = { x: number; y: number; w: number; h: number };

export default function FormTemplateEditor({
  data,
}: {
  data: FormTemplateEditorData;
}) {
  const [overrides, setOverrides] = useState<Record<string, BboxOverride>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveCanonicalFormTemplate(data.orderId, overrides);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        data.existingTemplateId
          ? "Canonical template updated. Future orders for this form load it instantly."
          : "Canonical template saved. Future orders for this form load it instantly."
      );
      setOverrides({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/god-mode"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Form Library
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {data.formTitle ?? "Untitled form"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.issuer ?? "Unknown issuer"}
              {data.masterTypeKey ? ` · ${data.masterTypeKey}` : ""}
              {" · "}
              {data.existingTemplateId
                ? "Updating saved canonical template"
                : "No template saved yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag any misaligned input into place. Saving writes a canonical
              layout keyed by issuer + form_title + content_fingerprint —
              every future ingest of the same form variant uses it
              instantly, regardless of which org placed the order.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(overrides).length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => setOverrides({})}
              >
                Discard
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
              className="bg-havn-navy text-white hover:bg-havn-navy/90"
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              {saving
                ? "Saving…"
                : Object.keys(overrides).length === 0
                  ? data.existingTemplateId
                    ? "Re-save (no changes)"
                    : "Save as canonical"
                  : `Save ${Object.keys(overrides).length} change${
                      Object.keys(overrides).length === 1 ? "" : "s"
                    }`}
            </Button>
          </div>
        </div>
      </div>

      <PdfOverlay
        pdfUrl={data.pdfSignedUrl}
        pages={data.pages}
        fields={data.fields}
        values={{}}
        onChange={() => {
          /* layout-edit only — values are not editable here */
        }}
        editingLayout={true}
        layoutOverrides={overrides}
        onLayoutOverride={(key, bbox) =>
          setOverrides((prev) => ({ ...prev, [key]: bbox }))
        }
      />
    </div>
  );
}
