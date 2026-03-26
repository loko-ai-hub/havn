"use client";

import { Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  PORTAL_DOCUMENTS,
  formatCurrency,
  getDocumentFee,
  type RequesterType,
} from "@/lib/portal-data";

type StepDocumentSelectionProps = {
  slug: string;
  requesterType: RequesterType;
  selectedDocumentIds: string[];
  onChangeSelectedDocumentIds: (ids: string[]) => void;
};

const HOMEOWNER_MUTEX_IDS = ["resale_cert", "resale_cert_update"] as const;

export default function StepDocumentSelection({
  slug,
  requesterType,
  selectedDocumentIds,
  onChangeSelectedDocumentIds,
}: StepDocumentSelectionProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const visibleDocuments = useMemo(
    () =>
      PORTAL_DOCUMENTS.filter((doc) => doc.availableTo.includes(requesterType)),
    [requesterType]
  );

  const selectedSet = useMemo(
    () => new Set(selectedDocumentIds),
    [selectedDocumentIds]
  );

  const total = useMemo(
    () => getDocumentFee(selectedDocumentIds),
    [selectedDocumentIds]
  );

  const toggleDocument = (id: string) => {
    const current = new Set(selectedSet);
    const doc = PORTAL_DOCUMENTS.find((item) => item.id === id);
    if (!doc) return;

    if (doc.required) return;

    if (requesterType === "homeowner" && HOMEOWNER_MUTEX_IDS.includes(id as (typeof HOMEOWNER_MUTEX_IDS)[number])) {
      HOMEOWNER_MUTEX_IDS.forEach((mutexId) => current.delete(mutexId));
      current.add(id);
      onChangeSelectedDocumentIds(Array.from(current));
      if (error) setError(null);
      return;
    }

    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    onChangeSelectedDocumentIds(Array.from(current));
    if (error) setError(null);
  };

  const handleContinue = () => {
    if (selectedDocumentIds.length === 0) {
      setError("Please select at least one document to continue.");
      return;
    }
    setError(null);
    router.push(`/r/${slug}/addons`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Select Documents
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose the documents needed for this transaction.
      </p>

      {requesterType === "homeowner" ? (
        <div className="mt-6 rounded-xl border border-havn-amber bg-havn-amber/10 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                What&apos;s included in a Resale Certificate?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Typical packages include association financials, governing
                documents, insurance details, current assessment data, and known
                compliance items for the property.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {visibleDocuments.map((doc) => {
          const selected = selectedSet.has(doc.id);
          const isHomeownerMutex =
            requesterType === "homeowner" &&
            HOMEOWNER_MUTEX_IDS.includes(doc.id as (typeof HOMEOWNER_MUTEX_IDS)[number]);

          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => toggleDocument(doc.id)}
              className={[
                "w-full rounded-xl border-2 p-4 text-left transition-colors",
                selected
                  ? "border-havn-success bg-havn-success/10"
                  : "border-border bg-card hover:border-havn-navy/40",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {isHomeownerMutex ? (
                      <span
                        className={[
                          "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border",
                          selected ? "border-havn-success" : "border-muted-foreground/40",
                        ].join(" ")}
                      >
                        {selected ? (
                          <span className="h-2 w-2 rounded-full bg-havn-success" />
                        ) : null}
                      </span>
                    ) : (
                      <span
                        className={[
                          "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm border",
                          selected ? "border-havn-success bg-havn-success/10" : "border-muted-foreground/40",
                        ].join(" ")}
                      >
                        {selected ? <span className="h-2 w-2 rounded-sm bg-havn-success" /> : null}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {doc.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {doc.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {doc.required ? (
                        <span className="rounded-full border border-border bg-havn-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                          Required
                        </span>
                      ) : null}
                      {isHomeownerMutex ? (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Pick one
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">
                  {formatCurrency(doc.fee)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Document total</p>
          <p className="text-lg font-semibold text-foreground">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.push(`/r/${slug}/property`)}
        >
          Back
        </Button>
        <Button
          type="button"
          className="flex-1 bg-havn-navy text-white hover:bg-havn-navy-light"
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
