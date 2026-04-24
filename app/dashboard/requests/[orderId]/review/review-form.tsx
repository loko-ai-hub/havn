"use client";

import { CheckCircle2, Database, FileText, Save, Sparkles, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DocumentTemplate } from "@/lib/document-templates";
import type { FieldSource, MergedField } from "@/lib/document-fields";

import { fulfillAndGenerate, saveDraftFields } from "../../actions";

const SOURCE_BADGE: Record<
  string,
  { label: string; icon: typeof Sparkles; className: string }
> = {
  ocr: {
    label: "OCR",
    icon: FileText,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  cache: {
    label: "Cached",
    icon: Database,
    className: "bg-havn-success/10 text-havn-success border-havn-success/20",
  },
  order: {
    label: "Order",
    icon: User,
    className: "bg-havn-amber/10 text-havn-amber border-havn-amber/20",
  },
};

type Props = {
  orderId: string;
  template: DocumentTemplate;
  initialFields: Record<string, MergedField>;
  completionPct: number;
  communityId: string | null;
  communities: { id: string; name: string }[];
  isFulfilled: boolean;
};

export default function ReviewForm({
  orderId,
  template,
  initialFields,
  completionPct,
  communityId: initialCommunityId,
  communities,
  isFulfilled,
}: Props) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, MergedField>>(initialFields);
  const [selectedCommunity, setSelectedCommunity] = useState(initialCommunityId ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: { value: value || null, source: prev[key]?.source ?? null },
    }));
  };

  const toPlainValues = (): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = v.value;
    }
    return out;
  };

  const filledCount = Object.values(fields).filter((f) => f.value?.trim()).length;
  const requiredCount = template.fields.filter((f) => f.required).length;
  const filledRequired = template.fields.filter(
    (f) => f.required && fields[f.key]?.value?.trim()
  ).length;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const result = await saveDraftFields(orderId, toPlainValues());
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (filledRequired < requiredCount) {
      toast.error(`Please fill all required fields (${filledRequired}/${requiredCount} complete).`);
      return;
    }
    setGenerating(true);
    try {
      const result = await fulfillAndGenerate(
        orderId,
        toPlainValues(),
        selectedCommunity || null
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Document generated and sent to requester.");
      router.push("/dashboard/requests");
      router.refresh();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Completion bar */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <Sparkles className="h-5 w-5 shrink-0 text-havn-navy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {filledCount} of {template.fields.length} fields populated
            </p>
            {(() => {
              const livePct = template.fields.length > 0 ? Math.min(100, Math.round((filledCount / template.fields.length) * 100)) : 0;
              return (
                <span className={cn(
                  "text-sm font-bold tabular-nums",
                  livePct >= 85 ? "text-havn-success" : livePct >= 50 ? "text-havn-amber" : "text-destructive"
                )}>
                  {livePct}%
                </span>
              );
            })()}
          </div>
          {(() => {
            const livePct = template.fields.length > 0 ? Math.min(100, Math.round((filledCount / template.fields.length) * 100)) : 0;
            return (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    livePct >= 85 ? "bg-havn-success" : livePct >= 50 ? "bg-havn-amber" : "bg-destructive"
                  )}
                  style={{ width: `${livePct}%` }}
                />
              </div>
            );
          })()}
        </div>
      </div>

      {/* Community selector */}
      {communities.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Community
          </Label>
          <select
            value={selectedCommunity}
            onChange={(e) => setSelectedCommunity(e.target.value)}
            disabled={false}
            className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          >
            <option value="">Select community...</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sections */}
      {template.sections.map((sectionName) => {
        const sectionFields = template.fields.filter((f) => f.section === sectionName);
        if (sectionFields.length === 0) return null;

        return (
          <div key={sectionName} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="bg-havn-navy px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                {sectionName}
              </h2>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {sectionFields.map((fieldDef) => {
                const merged = fields[fieldDef.key];
                const isTextarea = fieldDef.type === "textarea";

                return (
                  <div
                    key={fieldDef.key}
                    className={cn(
                      "space-y-1.5",
                      isTextarea && "sm:col-span-2"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`field-${fieldDef.key}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {fieldDef.label}
                        {fieldDef.required && (
                          <span className="ml-0.5 text-destructive">*</span>
                        )}
                      </Label>
                    </div>
                    {isTextarea ? (
                      <Textarea
                        id={`field-${fieldDef.key}`}
                        value={merged?.value ?? ""}
                        onChange={(e) => updateField(fieldDef.key, e.target.value)}
                        disabled={false}
                        rows={3}
                        className="text-sm disabled:opacity-50"
                      />
                    ) : (
                      <Input
                        id={`field-${fieldDef.key}`}
                        type={fieldDef.type === "date" ? "date" : "text"}
                        value={merged?.value ?? ""}
                        onChange={(e) => updateField(fieldDef.key, e.target.value)}
                        disabled={false}
                        className={cn(
                          "h-9 text-sm disabled:opacity-50",
                          fieldDef.required && !merged?.value?.trim() && "border-destructive/40"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        {isFulfilled && (
          <p className="text-xs text-havn-success font-medium">Previously generated and delivered</p>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <Button
            type="button"
            variant="outline"
            disabled={saving || generating}
            onClick={() => void handleSaveDraft()}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            type="button"
            disabled={saving || generating}
            onClick={() => void handleGenerate()}
            className="bg-havn-success text-white hover:bg-havn-success/90"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : isFulfilled ? "Regenerate PDF" : "Approve & Generate PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}
