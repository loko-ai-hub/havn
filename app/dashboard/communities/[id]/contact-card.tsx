"use client";

import { useState } from "react";
import { Mail, MapPin, Pencil, Phone, Shield, User, X } from "lucide-react";
import { toast } from "sonner";

import { upsertCommunityContact } from "./actions";

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

export default function CommunityContactCard({ communityId, contactType, label, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contact, setContact] = useState<Contact>(initial);
  const [draft, setDraft] = useState<Contact>(initial);

  const isEmpty = !contact.name && !contact.role && !contact.address && !contact.phone && !contact.email;

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await upsertCommunityContact(communityId, contactType, draft);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setContact(draft);
      setEditing(false);
      toast.success(`${label} contact saved.`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(contact);
    setEditing(false);
  };

  const iconEl = contactType === "insurance_agent"
    ? <Shield className="h-3.5 w-3.5 text-primary" />
    : <User className="h-3.5 w-3.5 text-primary" />;

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
        {!editing && (
          <button
            type="button"
            onClick={() => { setDraft(contact); setEditing(true); }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* View mode */}
      {!editing && (
        <div className="space-y-2.5">
          {isEmpty ? (
            <p className="text-xs text-muted-foreground italic">No contact on file — click edit to add.</p>
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
          {(["name", "role", "address", "phone", "email"] as const).map((field) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-medium capitalize text-muted-foreground">
                {field}
              </label>
              <input
                type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                value={draft[field] ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, [field]: e.target.value || null }))}
                placeholder={
                  field === "name" ? "Full name" :
                  field === "role" ? "e.g. Insurance Agent, Account Manager" :
                  field === "address" ? "Street, City, State ZIP" :
                  field === "phone" ? "(555) 000-0000" :
                  "email@example.com"
                }
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-havn-navy/20"
              />
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-havn-navy px-3 py-1.5 text-sm font-medium text-havn-sand hover:bg-havn-navy-light transition-colors disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
