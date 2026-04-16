"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { type DragEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { bulkAddCommunities } from "./actions";

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATE_CSV = [
  "Legal Name,City,State,ZIP,Community Type,Manager Name",
  '"Sunset Ridge HOA, Inc.",Bellevue,WA,98004,HOA,Patricia Wells',
  '"Oak Creek Estates",Tampa,FL,33602,COA,Robert Garcia',
].join("\n");

const TEMPLATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<communities>
  <community>
    <legal_name>Sunset Ridge HOA, Inc.</legal_name>
    <city>Bellevue</city>
    <state>WA</state>
    <zip>98004</zip>
    <community_type>HOA</community_type>
    <manager_name>Patricia Wells</manager_name>
  </community>
  <community>
    <legal_name>Oak Creek Estates</legal_name>
    <city>Tampa</city>
    <state>FL</state>
    <zip>33602</zip>
    <community_type>COA</community_type>
    <manager_name>Robert Garcia</manager_name>
  </community>
</communities>`;

// ─── CSV parsing ──────────────────────────────────────────────────────────────

interface ParsedRow {
  legal_name: string;
  city: string;
  state: string;
  zip: string;
  community_type: string;
  manager_name: string;
  errors: string[];
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const errors: string[] = [];
    const legal_name = cols[0] ?? "";
    const city = cols[1] ?? "";
    const state = cols[2] ?? "";
    const zip = cols[3] ?? "";
    if (!legal_name) errors.push("Missing legal name");
    if (!city) errors.push("Missing city");
    if (!state) errors.push("Missing state");
    if (!zip) errors.push("Missing ZIP");
    return {
      legal_name,
      city,
      state,
      zip,
      community_type: cols[4]?.trim() || "HOA",
      manager_name: cols[5]?.trim() ?? "",
      errors,
    };
  });
}

// Column name aliases so "legal name", "Legal Name", "LegalName" all work
const ALIASES: Record<string, keyof Omit<ParsedRow, "errors">> = {
  "legal name": "legal_name",
  "legal_name": "legal_name",
  "legalname": "legal_name",
  "name": "legal_name",
  "association name": "legal_name",
  "community name": "legal_name",
  "city": "city",
  "state": "state",
  "zip": "zip",
  "zip code": "zip",
  "postal code": "zip",
  "community type": "community_type",
  "communitytype": "community_type",
  "type": "community_type",
  "manager name": "manager_name",
  "managername": "manager_name",
  "manager": "manager_name",
  "contact name": "manager_name",
};

function parseSpreadsheet(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("No sheets found in the file.");

  // Get as array-of-arrays so we control header mapping
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (raw.length < 2) return [];

  const headerRow = (raw[0] as string[]).map((h) => String(h).trim().toLowerCase());

  // Map header index → our field key
  const colMap: Record<number, keyof Omit<ParsedRow, "errors">> = {};
  headerRow.forEach((h, i) => {
    const key = ALIASES[h];
    if (key) colMap[i] = key;
  });

  return raw.slice(1).map((row) => {
    const record: Partial<Omit<ParsedRow, "errors">> = {};
    Object.entries(colMap).forEach(([i, key]) => {
      record[key] = String((row as string[])[Number(i)] ?? "").trim();
    });
    const legal_name = record.legal_name ?? "";
    const city = record.city ?? "";
    const state = record.state ?? "";
    const zip = record.zip ?? "";
    const errors: string[] = [];
    if (!legal_name) errors.push("Missing legal name");
    if (!city) errors.push("Missing city");
    if (!state) errors.push("Missing state");
    if (!zip) errors.push("Missing ZIP");
    return {
      legal_name,
      city,
      state,
      zip,
      community_type: record.community_type || "HOA",
      manager_name: record.manager_name ?? "",
      errors,
    };
  }).filter((r) => Object.values(r).some((v) => v !== "" && v !== "HOA"));
}

function text(el: Element, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function parseXML(xmlText: string): ParsedRow[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Invalid XML file.");

  const nodes = Array.from(doc.getElementsByTagName("community"));
  if (nodes.length === 0) throw new Error("No <community> elements found.");

  return nodes.map((node) => {
    const legal_name = text(node, "legal_name");
    const city = text(node, "city");
    const state = text(node, "state");
    const zip = text(node, "zip");
    const errors: string[] = [];
    if (!legal_name) errors.push("Missing legal_name");
    if (!city) errors.push("Missing city");
    if (!state) errors.push("Missing state");
    if (!zip) errors.push("Missing zip");
    return {
      legal_name,
      city,
      state,
      zip,
      community_type: text(node, "community_type") || "HOA",
      manager_name: text(node, "manager_name"),
      errors,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  onClose: () => void;
  onDone: () => void;
}

export default function BulkUploadModal({ orgId, onClose, onDone }: Props) {
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = (format: "csv" | "xml") => {
    const isCSV = format === "csv";
    const blob = new Blob([isCSV ? TEMPLATE_CSV : TEMPLATE_XML], {
      type: isCSV ? "text/csv" : "application/xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `havn-communities-template.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const processFile = (file: File) => {
    const name = file.name.toLowerCase();
    const isCSV = name.endsWith(".csv");
    const isXML = name.endsWith(".xml");
    const isSpreadsheet = name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".numbers");

    if (!isCSV && !isXML && !isSpreadsheet) {
      toast.error("Accepted formats: CSV, XML, Excel (.xlsx/.xls), Numbers (.numbers)");
      return;
    }

    const reader = new FileReader();

    if (isSpreadsheet) {
      reader.onload = (e) => {
        try {
          const rows = parseSpreadsheet(e.target?.result as ArrayBuffer);
          if (rows.length === 0) {
            toast.error("No communities found in the spreadsheet.");
            return;
          }
          setParsed(rows);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to parse spreadsheet.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const content = e.target?.result as string;
        try {
          const rows = isCSV ? parseCSV(content) : parseXML(content);
          if (rows.length === 0) {
            toast.error(`No communities found in the ${isCSV ? "CSV" : "XML"}.`);
            return;
          }
          setParsed(rows);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to parse file.");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const errorRows = parsed?.filter((r) => r.errors.length > 0) ?? [];

  const handleImport = () => {
    if (!validRows.length) return;
    startTransition(async () => {
      const result = await bulkAddCommunities(
        orgId,
        validRows.map(({ legal_name, city, state, zip, community_type, manager_name }) => ({
          legal_name,
          city,
          state,
          zip,
          community_type,
          manager_name,
        }))
      );
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${validRows.length} ${validRows.length === 1 ? "community" : "communities"} imported.`
      );
      onDone();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-8 shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="mb-1 text-lg font-semibold text-foreground">Bulk Upload Communities</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Download a template, fill it in with your communities, then upload it here.
        </p>

        {/* Field reference */}
        <div className="mb-6 rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Field Reference
          </p>
          <div className="space-y-2">
            {[
              { field: "Legal Name", req: true, note: "Full legal name of the association" },
              { field: "City", req: true, note: "City where the community is located" },
              { field: "State", req: true, note: "2-letter state abbreviation, e.g. WA" },
              { field: "ZIP", req: true, note: "5-digit ZIP code" },
              { field: "Community Type", req: false, note: "HOA, COA, Condo Association, or Planned Development — defaults to HOA" },
              { field: "Manager Name", req: false, note: "Assigned property manager" },
            ].map(({ field, req, note }) => (
              <div key={field} className="flex items-baseline gap-2 text-xs">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${req ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  {req ? "required" : "optional"}
                </span>
                <span className="font-medium text-foreground">{field}</span>
                <span className="text-muted-foreground">— {note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Download templates */}
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadTemplate("csv")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            CSV Template
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate("xml")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            XML Template
          </button>
        </div>

        {!parsed ? (
          /* ── Drop zone ─────────────────────────────────────────────────── */
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/20 hover:border-muted-foreground/40 hover:bg-muted/30"
            }`}
          >
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drag & drop your file or click to upload
            </p>
            <p className="mt-1 text-xs text-muted-foreground">CSV, XML, Excel, or Numbers</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xml,.xlsx,.xls,.numbers"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          /* ── Preview ───────────────────────────────────────────────────── */
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4">
              {validRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-havn-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {validRows.length} ready to import
                </span>
              )}
              {errorRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {errorRows.length} with errors (will be skipped)
                </span>
              )}
            </div>

            {/* Preview table */}
            <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-havn-surface/30">
                    <th className="px-3 py-2 font-semibold text-muted-foreground"></th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Legal Name</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">City</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">State</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">ZIP</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Type</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.map((row, i) => (
                    <tr key={i} className={row.errors.length > 0 ? "bg-destructive/5" : ""}>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span title={row.errors.join(", ")}>
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          </span>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-havn-success" />
                        )}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 font-medium text-foreground">
                        {row.legal_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-foreground">{row.city || "—"}</td>
                      <td className="px-3 py-2 text-foreground">{row.state || "—"}</td>
                      <td className="px-3 py-2 text-foreground">{row.zip || "—"}</td>
                      <td className="px-3 py-2 text-foreground">{row.community_type || "—"}</td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-foreground">
                        {row.manager_name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setParsed(null)}
                className="h-11 flex-1 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                disabled={isPending}
              >
                Upload Different File
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={validRows.length === 0 || isPending}
                className="h-11 flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-havn-navy px-4 text-sm font-medium text-white transition-colors hover:bg-havn-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Import {validRows.length}{" "}
                {validRows.length === 1 ? "Community" : "Communities"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
