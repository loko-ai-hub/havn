"use client";

import { Check, Mail, MapPin, Pencil, Phone, RefreshCw, Shield, UserCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  assignCommunityManager,
  type OrgUserOption,
  rerunInsuranceAgentExtraction,
  upsertCommunityContact,
} from "./actions";

type Contact = {
  name: string | null;
  role: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type Props = {
  communityId: string;
  contactType: "insurance_agent" | "management_company";
  label: string;
  initial: Contact;
  // Only relevant for `management_company`: the picker is rendered when these
  // are passed. The contact card switches into "manager picker" mode where
  // changing the assigned user is the only way to update the contact.
  orgUsers?: OrgUserOption[];
  currentManagerId?: string | null;
};

function Field({ icon, value, placeholder }: { icon: React.ReactNode; value: string | null; placeholder: string }) {
  if (!value?.trim()) {
    return (
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground/40">{icon}</span>
        <span className="text-xs text-muted-foreground/50 italic">{placeholder}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="text-sm text-foreground break-words">{value}</span>
    </div>
  );
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Matches a segment that's *only* a unit designator like "Suite 100",
// "Apt 4B", "#205". These should be folded into the street, not the city.
const UNIT_ONLY_RE =
  /^(?:suite|ste|apt|apartment|unit|building|bldg|floor|fl|#)\s*[\w\-]+\.?$/i;

// Matches a segment that *starts with* a unit designator and has more text
// after — e.g. "Suite 100 Bellevue" where the OCR jammed unit + city into
// one comma segment. Group 1 = the unit portion, group 2 = the rest (city).
const UNIT_AND_REST_RE =
  /^((?:suite|ste|apt|apartment|unit|building|bldg|floor|fl|#)\s*[\w\-]+\.?)\s+(.+)$/i;

// Parse a combined address string into separate street / city / state / zip
// for the contact-card editor. Handles a few real-world OCR quirks:
//   - "40 Lake Bellevue, Suite 100, Bellevue, WA 98005" (clean canonical)
//   - "40 Lake Bellevue, Suite 100 Bellevue, WA 98005" (unit + city collided)
//   - "40 Lake Bellevue Suite 100, Bellevue, WA 98005" (no comma before unit)
function parseAddress(addr: string | null): { street: string; city: string; state: string; zip: string } {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const parts = addr.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return { street: "", city: "", state: "", zip: "" };
  if (parts.length === 1) return { street: parts[0], city: "", state: "", zip: "" };

  let street = parts[0];
  let cursor = 1;

  // Absorb any "Suite 100"-style segments that follow the street into the
  // street itself.
  while (cursor < parts.length && UNIT_ONLY_RE.test(parts[cursor])) {
    street += `, ${parts[cursor]}`;
    cursor++;
  }

  // If the next segment starts with a unit designator AND has more text
  // (e.g. "Suite 100 Bellevue"), split it: unit → street, remainder → city.
  if (cursor < parts.length) {
    const m = parts[cursor].match(UNIT_AND_REST_RE);
    if (m) {
      street += `, ${m[1]}`;
      parts[cursor] = m[2];
    }
  }

  const cityStateZip = parts.slice(cursor).join(", ").trim();
  const match = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (match) {
    return { street, city: match[1].replace(/,\s*$/, "").trim(), state: match[2], zip: match[3] };
  }
  return { street, city: cityStateZip, state: "", zip: "" };
}

function combineAddress(street: string, city: string, state: string, zip: string): string | null {
  const parts = [street, [city, state, zip].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function CommunityContactCard({
  communityId,
  contactType,
  label,
  initial,
  orgUsers,
  currentManagerId,
}: Props) {
  const router = useRouter();
  const isManagement = contactType === "management_company";
  const managerPickerEnabled = isManagement && Array.isArray(orgUsers);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [contact, setContact] = useState<Contact>(initial);
  const [draft, setDraft] = useState<Contact>(initial);

  // Manager-picker state (management_company only)
  const [picking, setPicking] = useState(false);
  const [savingManager, setSavingManager] = useState(false);

  const handlePickManager = async (userId: string | null) => {
    setSavingManager(true);
    try {
      const result = await assignCommunityManager(communityId, userId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(userId ? "Manager updated." : "Manager assignment cleared.");
      setPicking(false);
      // Refresh server-rendered data so the card reflects the new assignment.
      router.refresh();
    } finally {
      setSavingManager(false);
    }
  };

  // Separate address fields for editing
  const [addrParts, setAddrParts] = useState(() => parseAddress(initial.address));

  const isEmpty = !contact.name && !contact.role && !contact.address && !contact.phone && !contact.email;

  const defaultRole = "";

  const handleSave = async () => {
    // Email validation
    if (draft.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSaving(true);
    try {
      const finalDraft = {
        ...draft,
        role: draft.role || defaultRole,
        address: combineAddress(addrParts.street, addrParts.city, addrParts.state, addrParts.zip),
      };
      const result = await upsertCommunityContact(communityId, contactType, finalDraft);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setContact(finalDraft);
      setEditing(false);
      toast.success(`${label} contact saved.`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(contact);
    setAddrParts(parseAddress(contact.address));
    setEditing(false);
  };

  const handleStartEdit = () => {
    setDraft({ ...contact, role: contact.role || defaultRole });
    setAddrParts(parseAddress(contact.address));
    setEditing(true);
  };

  const handleRescanCOI = async () => {
    setRescanning(true);
    try {
      const result = await rerunInsuranceAgentExtraction(communityId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      if (result?.ok && result.extracted) {
        const next = {
          name: contact.name || result.extracted.name,
          role: contact.role || result.extracted.role,
          address: contact.address || result.extracted.address,
          phone: contact.phone || result.extracted.phone,
          email: contact.email || result.extracted.email,
        };
        setContact(next);
        toast.success(
          result.sourceFilename
            ? `Filled from ${result.sourceFilename}`
            : "Insurance agent info filled."
        );
      }
    } finally {
      setRescanning(false);
    }
  };

  const iconEl = contactType === "insurance_agent"
    ? <Shield className="h-3.5 w-3.5 text-primary" />
    : <UserCircle className="h-3.5 w-3.5 text-primary" />;

  const inputCls = "w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-havn-navy/20";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            {iconEl}
          </div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </h4>
        </div>
        {!editing && managerPickerEnabled && (
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
            {currentManagerId ? "Change" : "Assign"}
          </button>
        )}
        {!editing && !managerPickerEnabled && (
          <button
            type="button"
            onClick={handleStartEdit}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {/* Manager picker (management_company only) */}
      {managerPickerEnabled && picking && (
        <div className="space-y-2">
          <div className="max-h-64 overflow-auto rounded-lg border border-border bg-background">
            {orgUsers!.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground italic">
                No team members found. Invite users from Settings first.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {currentManagerId && (
                  <li>
                    <button
                      type="button"
                      disabled={savingManager}
                      onClick={() => void handlePickManager(null)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-40"
                    >
                      <span className="text-xs font-medium text-destructive">
                        Clear assignment
                      </span>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </li>
                )}
                {orgUsers!.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={savingManager}
                      onClick={() => void handlePickManager(u.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-40"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {u.role}
                        </span>
                        {u.id === currentManagerId && (
                          <Check className="h-3.5 w-3.5 text-havn-success" />
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPicking(false)}
              disabled={savingManager}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* View mode */}
      {!editing && !(managerPickerEnabled && picking) && (
        <div className="space-y-2.5">
          {isEmpty ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground italic">
                {contactType === "insurance_agent"
                  ? "Upload your COI to pre-populate this information."
                  : managerPickerEnabled
                    ? "No manager assigned yet. Click Assign to pick a team member."
                    : "No contact on file. Click edit to add."}
              </p>
              {contactType === "insurance_agent" && (
                <button
                  type="button"
                  onClick={() => void handleRescanCOI()}
                  disabled={rescanning}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${rescanning ? "animate-spin" : ""}`} />
                  {rescanning ? "Scanning…" : "Auto-fill from latest COI"}
                </button>
              )}
            </div>
          ) : (
            <>
              {contact.name && (
                <div>
                  <p className="text-sm font-medium text-foreground">{contact.name}</p>
                  {contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}
                </div>
              )}
              <Field icon={<MapPin className="h-3.5 w-3.5" />} value={contact.address} placeholder="No address" />
              <Field icon={<Phone className="h-3.5 w-3.5" />} value={contact.phone} placeholder="No phone" />
              <Field icon={<Mail className="h-3.5 w-3.5" />} value={contact.email} placeholder="No email" />
            </>
          )}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <input type="text" value={draft.name ?? ""} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value || null }))} placeholder="Full name" className={inputCls} />
          </div>

          {/* Company / Brokerage */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {contactType === "insurance_agent" ? "Insurance Company / Brokerage" : "Company"}
            </label>
            <input type="text" value={draft.role ?? defaultRole} onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value || null }))} placeholder={contactType === "insurance_agent" ? "e.g. State Farm, Allstate" : "Company name"} className={inputCls} />
          </div>

          {/* Address — split fields */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Street Address</label>
            <input type="text" value={addrParts.street} onChange={(e) => setAddrParts((p) => ({ ...p, street: e.target.value }))} placeholder="123 Main St" className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
              <input type="text" value={addrParts.city} onChange={(e) => setAddrParts((p) => ({ ...p, city: e.target.value }))} placeholder="Seattle" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
              <input type="text" value={addrParts.state} onChange={(e) => setAddrParts((p) => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="WA" maxLength={2} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">ZIP</label>
              <input type="text" value={addrParts.zip} onChange={(e) => setAddrParts((p) => ({ ...p, zip: e.target.value.replace(/[^0-9-]/g, "").slice(0, 10) }))} placeholder="98101" className={inputCls} />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
            <input type="tel" value={draft.phone ?? ""} onChange={(e) => setDraft((p) => ({ ...p, phone: formatPhone(e.target.value) || null }))} placeholder="(555) 000-0000" className={inputCls} />
          </div>

          {/* Email */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <input type="email" value={draft.email ?? ""} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value || null }))} placeholder="email@example.com" className={inputCls} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={handleCancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40">
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex items-center rounded-lg bg-havn-navy px-3 py-1.5 text-sm font-medium text-havn-sand hover:bg-havn-navy-light transition-colors disabled:opacity-40">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
