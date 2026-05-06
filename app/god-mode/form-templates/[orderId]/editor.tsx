"use client";

import {
  ArrowLeft,
  CheckSquare,
  Plus,
  Save,
  Trash2,
  Type,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  saveCanonicalFormTemplate,
  type FormTemplateEditorData,
  type RegistryOption,
} from "../../form-templates-actions";

const PdfOverlay = dynamic(
  () => import("@/app/dashboard/requests/[orderId]/review/pdf-overlay"),
  { ssr: false }
);

type FieldRow = FormTemplateEditorData["fields"][number] & {
  /** Stable identifier within the editor — derived from registry key
   * when present, else a random uid for staff-added fields. */
  uid: string;
};

/**
 * Stable-ish editor uid for AI-emitted fields. Mirrors the synthetic
 * key the per-order overlay uses so dragged positions round-trip.
 */
function uidFor(
  field: FormTemplateEditorData["fields"][number],
  idx: number
): string {
  if (field.registryKey) return `reg:${field.registryKey}:${idx}`;
  const norm = field.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `unmapped:${field.page}:${norm || `idx${idx}`}`;
}

function newFieldUid(): string {
  return `new:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

const TIER_TOOLTIPS: Record<RegistryOption["lifecycleTier"], string> = {
  governing:
    "From governing docs (CC&Rs/bylaws). Cache forever; updates only on re-OCR or manual edit.",
  onboarding:
    "Set during community onboarding. Cache until manual edit.",
  per_unit:
    "Varies per unit. Refetched from community_units at order time; never cached.",
  per_order: "Order-specific. Read live from the order; never cached.",
};

export default function FormTemplateEditor({
  data,
  registryOptions,
}: {
  data: FormTemplateEditorData;
  registryOptions: RegistryOption[];
}) {
  // Single source of truth: the entire layout. Edits mutate this list.
  const initial: FieldRow[] = data.fields.map((f, idx) => ({
    ...f,
    uid: uidFor(f, idx),
  }));
  const [fields, setFields] = useState<FieldRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Compute the per-field bbox map the overlay reads, keyed by uid.
  const overlayFields = useMemo(
    () =>
      fields.map((f) => ({
        registryKey: f.uid, // hijack so the overlay's value lookup works on uid
        label: f.label || "(no label)",
        page: f.page,
        kind: (f.kind as "text" | "checkbox" | undefined) ?? "text",
        valueBbox: f.valueBbox,
        labelBbox: f.labelBbox,
        currentValue: f.currentValue ?? "",
      })),
    [fields]
  );
  const layoutOverrides = useMemo(() => {
    const m: Record<
      string,
      { x: number; y: number; w: number; h: number }
    > = {};
    for (const f of fields) {
      if (f.valueBbox) m[f.uid] = f.valueBbox;
    }
    return m;
  }, [fields]);

  const handleAdd = (kind: "text" | "checkbox") => {
    const newField: FieldRow = {
      uid: newFieldUid(),
      registryKey: null,
      label: kind === "checkbox" ? "New checkbox" : "New field",
      page: 1,
      kind,
      // Drop in the middle of page 1 so it's hard to miss. Staff drags
      // it into place from there.
      valueBbox:
        kind === "checkbox"
          ? { x: 0.48, y: 0.45, w: 0.02, h: 0.02 }
          : { x: 0.3, y: 0.45, w: 0.4, h: 0.025 },
      labelBbox: null,
      currentValue: kind === "checkbox" ? "false" : "",
    };
    setFields((prev) => [...prev, newField]);
    setSelectedUid(newField.uid);
    toast.message(
      kind === "checkbox"
        ? "Added a checkbox at the middle of page 1 — drag it into place."
        : "Added a text field at the middle of page 1 — drag it into place."
    );
  };

  const handleUpdate = (uid: string, patch: Partial<FieldRow>) => {
    setFields((prev) =>
      prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f))
    );
  };

  const handleDelete = (uid: string) => {
    setFields((prev) => prev.filter((f) => f.uid !== uid));
    if (selectedUid === uid) setSelectedUid(null);
  };

  const handleClearAll = () => {
    if (fields.length === 0) return;
    const ok = window.confirm(
      `Remove all ${fields.length} fields from this template? This won't save until you click ${
        data.existingTemplateId ? "Update template" : "Save as canonical"
      }, so you can cancel by leaving without saving.`
    );
    if (!ok) return;
    setFields([]);
    setSelectedUid(null);
    toast.message("All fields cleared. Add fields with the buttons above.");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Strip the editor-only `uid` before sending to the server.
      const payload = fields.map(({ uid: _uid, ...rest }) => rest);
      const result = await saveCanonicalFormTemplate(data.orderId, payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        data.existingTemplateId
          ? "Canonical template updated. Future orders for this form load it instantly."
          : "Canonical template saved. Future orders for this form load it instantly."
      );
    } finally {
      setSaving(false);
    }
  };

  const selected = fields.find((f) => f.uid === selectedUid) ?? null;

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
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleAdd("text")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              <Type className="mr-1 h-3.5 w-3.5" />
              Text
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleAdd("checkbox")}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              <CheckSquare className="mr-1 h-3.5 w-3.5" />
              Checkbox
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={fields.length === 0}
              onClick={handleClearAll}
              className="border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear all
            </Button>
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
                : data.existingTemplateId
                  ? "Update template"
                  : "Save as canonical"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <PdfOverlay
            pdfUrl={data.pdfSignedUrl}
            pages={data.pages}
            fields={overlayFields}
            values={{}}
            onChange={() => {
              /* layout-edit only — values are not editable here */
            }}
            editingLayout={true}
            layoutOverrides={layoutOverrides}
            onLayoutOverride={(uid, bbox) =>
              handleUpdate(uid, { valueBbox: bbox })
            }
          />
        </div>

        <aside className="space-y-3">
          {selected ? (
            <FieldEditor
              field={selected}
              registryOptions={registryOptions}
              onChange={(patch) => handleUpdate(selected.uid, patch)}
              onDelete={() => handleDelete(selected.uid)}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Select a field to map it
              </p>
              <p className="mt-1 text-xs">
                Click a row in the list below (or any field on the PDF)
                and the merge-tag library opens here. Every available
                merge tag from Havn&apos;s registry is in the dropdown.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              All fields ({fields.length})
            </p>
          </div>

          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card">
            {fields.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No fields yet. Add one with the buttons above.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {fields.map((f) => (
                  <li
                    key={f.uid}
                    className={cn(
                      "group cursor-pointer px-3 py-2 transition-colors hover:bg-muted/40",
                      selectedUid === f.uid && "bg-muted/60"
                    )}
                    onClick={() => setSelectedUid(f.uid)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {f.label || "(no label)"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          p{f.page} · {f.kind ?? "text"} ·{" "}
                          {f.registryKey ?? (
                            <span className="italic text-havn-amber">unmapped</span>
                          )}
                        </p>
                      </div>
                      <KindBadge kind={f.kind ?? "text"} />
                      <button
                        type="button"
                        title={`Delete "${f.label || "(no label)"}"`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(f.uid);
                        }}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  if (kind === "checkbox") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-havn-success/30 bg-havn-success/10 px-1.5 py-0.5 text-[10px] font-medium text-havn-success">
        <CheckSquare className="h-3 w-3" />
        check
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-havn-navy/30 bg-havn-navy/10 px-1.5 py-0.5 text-[10px] font-medium text-havn-navy">
      <Type className="h-3 w-3" />
      text
    </span>
  );
}

function FieldEditor({
  field,
  registryOptions,
  onChange,
  onDelete,
}: {
  field: FieldRow;
  registryOptions: RegistryOption[];
  onChange: (patch: Partial<FieldRow>) => void;
  onDelete: () => void;
}) {
  const [tagFilter, setTagFilter] = useState("");
  const selectedRegistry =
    registryOptions.find((o) => o.key === field.registryKey) ?? null;

  const filteredOptions = useMemo(() => {
    const q = tagFilter.toLowerCase().trim();
    if (!q) return registryOptions;
    return registryOptions.filter(
      (o) =>
        o.key.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q)
    );
  }, [tagFilter, registryOptions]);

  return (
    <div className="space-y-3 rounded-xl border border-havn-navy/40 bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-havn-navy">
        Edit field
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Type</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onChange({
                kind: "text",
                currentValue: field.currentValue ?? "",
              })
            }
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
              field.kind !== "checkbox"
                ? "border-havn-navy bg-havn-navy/10 text-havn-navy"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <Type className="mr-1 inline h-3 w-3" />
            Text
          </button>
          <button
            type="button"
            onClick={() => onChange({ kind: "checkbox", currentValue: "false" })}
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
              field.kind === "checkbox"
                ? "border-havn-success bg-havn-success/10 text-havn-success"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <CheckSquare className="mr-1 inline h-3 w-3" />
            Checkbox
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Merge tag · {registryOptions.length} available
        </Label>
        <Input
          placeholder="Search merge tags…"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="text-xs"
        />
        <select
          value={field.registryKey ?? ""}
          onChange={(e) =>
            onChange({
              registryKey: e.target.value === "" ? null : e.target.value,
            })
          }
          size={6}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        >
          <option value="">— Unmapped —</option>
          {filteredOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} ({o.key}) · {o.lifecycleTier}
            </option>
          ))}
        </select>
        {selectedRegistry ? (
          <p
            className="rounded bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
            title={TIER_TOOLTIPS[selectedRegistry.lifecycleTier]}
          >
            <span className="font-medium text-foreground">
              {selectedRegistry.label}
            </span>{" "}
            — {selectedRegistry.description}
          </p>
        ) : (
          <p className="text-[11px] italic text-havn-amber">
            Currently unmapped — pick a merge tag above so values can
            auto-populate from the cache.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Page</Label>
        <Input
          type="number"
          min={1}
          value={field.page}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1) onChange({ page: n });
          }}
        />
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-3 w-3" />
        Delete field
      </button>
    </div>
  );
}
