"use client";

import {
  CheckCircle2,
  Download,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DocumentTemplate } from "@/lib/document-templates";
import type { MergedField } from "@/lib/document-fields";

import {
  fulfillAndGenerate,
  getVersionDownloadUrl,
  listOrderDocumentVersions,
  saveDraftFields,
  type OrderDocumentVersion,
  type SignaturePayload,
} from "../../actions";

type Props = {
  orderId: string;
  template: DocumentTemplate;
  initialFields: Record<string, MergedField>;
  completionPct: number;
  communityId: string | null;
  communities: { id: string; name: string }[];
  isFulfilled: boolean;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
};

export default function ReviewForm({
  orderId,
  template,
  initialFields,
  completionPct,
  communityId: initialCommunityId,
  communities,
  isFulfilled,
  currentUserName,
  currentUserEmail,
}: Props) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, MergedField>>(initialFields);
  const [selectedCommunity, setSelectedCommunity] = useState(initialCommunityId ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [versions, setVersions] = useState<OrderDocumentVersion[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listOrderDocumentVersions(orderId).then((result) => {
      if (cancelled) return;
      if (!("error" in result)) setVersions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

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
  const requiresSignature = !!template.requiresSignature;

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

  const runGeneration = async (signature?: SignaturePayload) => {
    setGenerating(true);
    try {
      const result = await fulfillAndGenerate(
        orderId,
        toPlainValues(),
        selectedCommunity || null,
        signature
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        signature
          ? `Signed as V${result.version} and delivered.`
          : `V${result.version} generated and sent to requester.`
      );
      router.push("/dashboard/requests");
      router.refresh();
    } finally {
      setGenerating(false);
    }
  };

  const handlePrimary = async () => {
    if (filledRequired < requiredCount) {
      toast.error(`Please fill all required fields (${filledRequired}/${requiredCount} complete).`);
      return;
    }
    if (requiresSignature) {
      setSignatureOpen(true);
      return;
    }
    await runGeneration();
  };

  const handleVersionDownload = async (docId: string, label: string) => {
    const result = await getVersionDownloadUrl(docId);
    if ("error" in result) {
      toast.error(`Download failed (${label}): ${result.error}`);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
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

      {/* Version tabs */}
      {versions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Versions
            </Label>
            <p className="text-xs text-muted-foreground">
              {versions.length} {versions.length === 1 ? "version" : "versions"} on file
            </p>
          </div>
          <div className="mt-3 divide-y divide-border">
            {versions.map((v) => {
              const label = `V${v.version}`;
              const genDate = v.generatedAt
                ? new Date(v.generatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : null;
              const expired = v.expiresAt ? new Date(v.expiresAt).getTime() < Date.now() : false;
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-6 min-w-[32px] items-center justify-center rounded-md bg-havn-navy px-1.5 text-xs font-bold text-white">
                      {label}
                    </span>
                    <span className="text-foreground">
                      Generated {genDate ?? "—"}
                    </span>
                    {v.hasSignature && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-havn-success/30 bg-havn-success/10 px-1.5 py-0.5 text-xs text-havn-success">
                        <ShieldCheck className="h-3 w-3" />
                        Signed
                        {v.signerName ? ` · ${v.signerName}` : ""}
                      </span>
                    )}
                    {expired && (
                      <span className="rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        Expired
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleVersionDownload(v.id, label)}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
            onClick={() => void handlePrimary()}
            className="bg-havn-success text-white hover:bg-havn-success/90"
          >
            {requiresSignature ? (
              <ShieldCheck className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {generating
              ? "Generating..."
              : requiresSignature
                ? isFulfilled
                  ? "Sign & Regenerate"
                  : "Approve & Sign"
                : isFulfilled
                  ? "Regenerate PDF"
                  : "Approve & Generate PDF"}
          </Button>
        </div>
      </div>

      {signatureOpen && (
        <SignatureModal
          template={template}
          defaultSignerName={currentUserName ?? ""}
          defaultSignerEmail={currentUserEmail ?? ""}
          onCancel={() => setSignatureOpen(false)}
          onSign={async (payload) => {
            setSignatureOpen(false);
            await runGeneration(payload);
          }}
          generating={generating}
        />
      )}
    </div>
  );
}

/* ── Signature modal (click-to-sign) ───────────────────────────────── */

type SignatureModalProps = {
  template: DocumentTemplate;
  defaultSignerName: string;
  defaultSignerEmail: string;
  generating: boolean;
  onCancel: () => void;
  onSign: (payload: SignaturePayload) => Promise<void>;
};

function SignatureModal({
  template,
  defaultSignerName,
  defaultSignerEmail,
  generating,
  onCancel,
  onSign,
}: SignatureModalProps) {
  const [name, setName] = useState(defaultSignerName);
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState(defaultSignerEmail);
  const [certified, setCertified] = useState(false);

  const canSubmit = name.trim().length > 0 && email.trim().length > 0 && certified;
  const certificationText =
    template.legalLanguage?.certificationText ??
    "I certify that the information provided above is true and accurate to the best of my knowledge.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-havn-success/10 p-2 text-havn-success">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Sign & Certify</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          This document requires a signature before it can be delivered.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <Label htmlFor="sig-name" className="text-xs font-medium">
              Your name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sig-title" className="text-xs font-medium">
              Title
            </Label>
            <Input
              id="sig-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Community Manager"
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sig-email" className="text-xs font-medium">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sig-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <label className="mt-2 flex items-start gap-2 rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-foreground">
            <input
              type="checkbox"
              checked={certified}
              onChange={(e) => setCertified(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-havn-success"
            />
            <span>{certificationText}</span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" disabled={generating} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || generating}
            onClick={() =>
              void onSign({
                signerName: name.trim(),
                signerEmail: email.trim(),
                signerTitle: title.trim() || null,
                signedAt: new Date().toISOString(),
                signatureData: "click-to-sign",
              })
            }
            className="bg-havn-success text-white hover:bg-havn-success/90"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {generating ? "Signing..." : "Sign & Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
