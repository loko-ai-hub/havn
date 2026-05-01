// Parses a Vantaca homeowner export (.xlsx) into our community_units row
// shape. The Vantaca file is shaped like this:
//
//   Account #   Homeowner                  Address                                Phone        Email           Logins                Balance ...
//   GFPC10338   Julian Abad Julian Abad    P: 10032 12th Ave SE M: 10032 ...     (206) ...    foo@bar.com    foo@bar.com           231     ...
//
// Quirks handled:
//   * "Julian Abad Julian Abad" — Vantaca concatenates two owners with no
//     delimiter. For evenly-split word counts (4, 6, 8...) we split midpoint
//     and dedupe identical halves. Odd word counts stay as one owner.
//   * "P: <addr> M: <addr>" — split on the literal " M: " marker.
//   * Logins is comma-separated; spaces around addresses are tolerated.

import * as XLSX from "xlsx";

export type VantacaUnitRow = {
  accountNumber: string | null;
  ownerNames: string[];
  propertyStreet: string;
  mailingStreet: string;
  mailingSameAsProperty: boolean;
  phone: string | null;
  primaryEmail: string | null;
  additionalEmails: string[];
  leaseStatus: string | null;
  rawRow: Record<string, unknown>;
};

export function parseOwnerNames(raw: string): string[] {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return [];
  const words = trimmed.split(" ");
  // Heuristic: if we have an even number of words >= 4, assume two owners
  // with equally-sized name halves. Dedupe identical halves (Vantaca often
  // exports "Julian Abad Julian Abad" for a single owner).
  if (words.length >= 4 && words.length % 2 === 0) {
    const half = words.length / 2;
    const a = words.slice(0, half).join(" ");
    const b = words.slice(half).join(" ");
    if (a.toLowerCase() === b.toLowerCase()) return [a];
    return [a, b];
  }
  return [trimmed];
}

export function parseAddresses(raw: string): {
  propertyStreet: string;
  mailingStreet: string;
} {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { propertyStreet: "", mailingStreet: "" };

  // Find the literal " M: " separator. If absent, the whole thing is the
  // property address (after stripping a leading "P: ").
  const idx = trimmed.indexOf(" M: ");
  if (idx === -1) {
    const property = trimmed.replace(/^P:\s*/, "").trim();
    return { propertyStreet: property, mailingStreet: property };
  }
  const propertyPart = trimmed.slice(0, idx).replace(/^P:\s*/, "").trim();
  const mailingPart = trimmed.slice(idx + " M: ".length).trim();
  return { propertyStreet: propertyPart, mailingStreet: mailingPart || propertyPart };
}

export function parseEmails(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseVantacaWorkbook(buffer: Buffer): VantacaUnitRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const result: VantacaUnitRow[] = [];

  for (const row of rows) {
    const accountNumber = String(row["Account #"] ?? "").trim() || null;
    const ownerRaw = String(row["Homeowner"] ?? "").trim();
    const addressRaw = String(row["Address"] ?? "").trim();
    const phone = String(row["Phone"] ?? "").trim() || null;
    const email = String(row["Email"] ?? "").trim() || null;
    const loginsRaw = String(row["Logins"] ?? "").trim();
    const leaseStatus = String(row["Lease Status"] ?? "").trim() || null;

    // Ignore total-blank rows (occasional XLSX trailing whitespace).
    if (!accountNumber && !ownerRaw && !addressRaw && !phone && !email) continue;

    const ownerNames = parseOwnerNames(ownerRaw);
    const { propertyStreet, mailingStreet } = parseAddresses(addressRaw);
    const mailingSameAsProperty =
      mailingStreet.trim().toLowerCase() === propertyStreet.trim().toLowerCase();

    const additionalEmails = parseEmails(loginsRaw).filter(
      (e) => e.toLowerCase() !== (email ?? "").toLowerCase()
    );

    result.push({
      accountNumber,
      ownerNames,
      propertyStreet,
      mailingStreet,
      mailingSameAsProperty,
      phone,
      primaryEmail: email,
      additionalEmails,
      leaseStatus,
      rawRow: row,
    });
  }

  return result;
}
