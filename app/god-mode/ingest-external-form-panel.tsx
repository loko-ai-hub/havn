"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { ingestExternalTemplateAction } from "./templates-actions";
import type { ExternalTemplateIngestion } from "@/lib/ingest-external-template";

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <p className="font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-foreground">{value}</p>
    </div>
  );
}

/**
 * Click-to-map panel for a single third-party form. Lives on the 3P
 * Templates tab above the uploaded-templates list — staff paste the
 * OCR-extracted text from a vendor form, Claude maps each field to
 * Havn's merge-tag registry, and the result shows inline for review
 * before approval.
 */
export default function IngestExternalFormPanel() {
  const [formText, setFormText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExternalTemplateIngestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIngest = async () => {
    if (!formText.trim()) {
      toast.error("Paste the extracted form text first.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await ingestExternalTemplateAction(formText);
      if ("error" in res) {
        setError(res.error);
        toast.error(res.error);
      } else {
        setResult(res);
        toast.success(
          `Mapped ${res.mappedCount} of ${res.mappedCount + res.unmappedCount} fields.`
        );
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-havn-navy" />
        <h2 className="text-sm font-semibold text-foreground">
          Map a new vendor form
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste the OCR-extracted text from a vendor form (lender
        questionnaire, title company form, etc.) and Claude will map each
        field to Havn&apos;s registry. Review the mapping below, then
        approve it in the uploaded-templates list.
      </p>
      <Textarea
        value={formText}
        onChange={(e) => setFormText(e.target.value)}
        placeholder="Paste extracted form text…"
        rows={5}
        className="mt-3 text-sm"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" onClick={() => void handleIngest()} disabled={running}>
          <Upload className="mr-2 h-4 w-4" />
          {running ? "Mapping…" : "Map form to registry"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      {result && (
        <div className="mt-4 space-y-2 rounded-md border border-border bg-background p-3 text-xs">
          <div className="grid gap-2 sm:grid-cols-3">
            <InfoLine label="Form title" value={result.formTitle ?? "—"} />
            <InfoLine label="Issuer" value={result.issuer ?? "—"} />
            <InfoLine
              label="Mapped"
              value={`${result.mappedCount} / ${result.mappedCount + result.unmappedCount}`}
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">External label</th>
                  <th className="px-2 py-1.5 text-left font-medium">Kind</th>
                  <th className="px-2 py-1.5 text-left font-medium">Registry key</th>
                  <th className="px-2 py-1.5 text-left font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {result.fields.map((f, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-2 py-1 text-foreground">{f.externalLabel}</td>
                    <td className="px-2 py-1 text-muted-foreground">{f.fieldKind}</td>
                    <td className="px-2 py-1 font-mono">
                      {f.registryKey ?? (
                        <span className="text-havn-amber">unmapped</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {f.confidence != null ? f.confidence.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
