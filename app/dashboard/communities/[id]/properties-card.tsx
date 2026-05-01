"use client";

import { Building2, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { importVantacaProperties } from "./actions";

type Props = {
  communityId: string;
  initialCount: number;
  initialImportedAt: string | null;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      const base64 = result.split(",", 2)[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.readAsDataURL(file);
  });
}

export default function CommunityPropertiesCard({
  communityId,
  initialCount,
  initialImportedAt,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [importedAt, setImportedAt] = useState(initialImportedAt);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await importVantacaProperties({
        communityId,
        filename: file.name,
        base64,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setCount(result.imported);
      setImportedAt(new Date().toISOString());
      setPreview(result.preview);
      toast.success(
        `Imported ${result.imported} ${result.imported === 1 ? "property" : "properties"}.`
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const lastImported = importedAt
    ? new Date(importedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Property Roster
          </h4>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={onChange}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {uploading
            ? "Importing…"
            : count > 0
              ? "Re-import"
              : "Import Vantaca export"}
        </button>
      </div>

      <div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {count}
        </p>
        <p className="text-xs text-muted-foreground">
          {count === 1 ? "property on file" : "properties on file"}
          {lastImported ? ` · last imported ${lastImported}` : ""}
        </p>
      </div>

      {count > 0 && (
        <Link
          href={`/dashboard/communities/${communityId}/properties`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          View all properties →
        </Link>
      )}

      {count === 0 && (
        <p className="text-[11px] text-muted-foreground/80 italic">
          Upload your Vantaca homeowner export (.xlsx) to populate. We&apos;ll
          parse owner names, addresses, and contact info, and use it to
          auto-fill order forms when requests come in for these units.
        </p>
      )}

      {preview.length > 0 && (
        <div className="rounded-lg border border-havn-success/30 bg-havn-success/5 px-3 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-havn-success">
            Preview of first {preview.length} rows:
          </p>
          {preview.map((line) => (
            <p key={line} className="text-[11px] text-foreground/80 truncate">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
