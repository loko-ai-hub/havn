"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export type UnitRow = {
  id: string;
  account_number: string | null;
  property_street: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  mailing_street: string | null;
  mailing_same_as_property: boolean | null;
  owner_names: string[] | null;
  primary_email: string | null;
  additional_emails: string[] | null;
  phone: string | null;
  lease_status: string | null;
};

function joinAddress(
  street: string | null,
  city: string | null,
  state: string | null,
  zip: string | null
): string {
  const parts = [
    street?.trim(),
    [city?.trim(), state?.trim(), zip?.trim()].filter(Boolean).join(" "),
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
  return parts.join(", ");
}

export default function PropertiesTable({ rows }: { rows: UnitRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.account_number,
        r.property_street,
        r.mailing_street,
        ...(r.owner_names ?? []),
        r.primary_email,
        ...(r.additional_emails ?? []),
        r.phone,
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by account #, address, owner, email, or phone…"
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-havn-navy/20"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length}{" "}
        {rows.length === 1 ? "property" : "properties"}.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Account #</th>
              <th className="px-4 py-2.5">Owners</th>
              <th className="px-4 py-2.5">Property Address</th>
              <th className="px-4 py-2.5">Mailing Address</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                  {rows.length === 0
                    ? "No properties on file yet. Import your Vantaca homeowner export from the community page."
                    : "No matches for that search."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const propertyAddr = joinAddress(
                  r.property_street,
                  r.property_city,
                  r.property_state,
                  r.property_zip
                );
                const mailingAddr = r.mailing_same_as_property
                  ? "Same as property"
                  : r.mailing_street ?? "—";
                const owners = (r.owner_names ?? []).join(" & ") || "—";
                return (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 align-top text-xs font-mono text-muted-foreground">
                      {r.account_number ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="text-foreground">{owners}</p>
                    </td>
                    <td className="px-4 py-2.5 align-top text-foreground/90">
                      {propertyAddr || "—"}
                    </td>
                    <td className="px-4 py-2.5 align-top text-muted-foreground">
                      {mailingAddr}
                    </td>
                    <td className="px-4 py-2.5 align-top text-muted-foreground tabular-nums">
                      {r.phone ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="text-foreground/90 truncate max-w-[200px]">
                        {r.primary_email ?? "—"}
                      </p>
                      {r.additional_emails && r.additional_emails.length > 0 && (
                        <p className="text-[11px] text-muted-foreground/70">
                          +{r.additional_emails.length} more
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top text-xs text-muted-foreground">
                      {r.lease_status ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
