"use client";

import { useState } from "react";
import { Plus, X, Mail, CheckCircle2, Shield, Info, AlertTriangle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteEntry {
  email: string;
}

interface StepInviteAdminsProps {
  accountType: "management_company" | "self_managed";
  onFinish: (emails: string[]) => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

const MAX_INVITES = 10;

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const getDomain = (email: string) => {
  const match = email.trim().match(/@(.+)$/);
  return match ? match[1].toLowerCase() : "";
};

const PERSONAL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "live.com",
  "msn.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "zoho.com",
  "ymail.com",
  "comcast.net",
  "att.net",
  "verizon.net",
  "cox.net",
];

const isPersonalEmail = (email: string) => {
  const domain = getDomain(email);
  return PERSONAL_DOMAINS.includes(domain);
};

export default function StepInviteAdmins({
  accountType,
  onFinish,
  onSkip,
  isSubmitting = false,
}: StepInviteAdminsProps) {
  const [invites, setInvites] = useState<InviteEntry[]>([{ email: "" }]);
  const [creatorEmail] = useState(
    accountType === "self_managed" ? "boardmember@email.com" : "you@yourcompany.com"
  );

  const creatorDomain = getDomain(creatorEmail);

  const isBoard = accountType === "self_managed";
  const title = isBoard ? "Invite board members" : "Invite your team";
  const subtitle = isBoard
    ? "Add up to 10 board members. They'll receive a signup email to join your portal."
    : "Add up to 10 teammates. They'll receive a signup email to join your portal.";

  const updateEmail = (index: number, value: string) => {
    setInvites((prev) => prev.map((e, i) => (i === index ? { ...e, email: value } : e)));
  };

  const addRow = () => {
    if (invites.length < MAX_INVITES) setInvites((prev) => [...prev, { email: "" }]);
  };

  const removeRow = (index: number) => {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  };

  const validEmails = invites.filter((e) => isValidEmail(e.email)).map((e) => e.email.trim());
  const hasValidEmails = validEmails.length > 0;

  return (
    <div className="flex h-full justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">You&apos;re the Super Admin</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                As the account creator, you&apos;ll be set up as{" "}
                <span className="font-semibold text-foreground">Super Admin</span> with full
                access. This can be reassigned to another user in{" "}
                <span className="font-semibold text-foreground">Settings -&gt; Roles</span> at any
                time.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">
              {isBoard ? "Board member invitations" : "Team invitations"}
            </Label>

            {invites.map((invite, index) => {
              const hasEmail = invite.email.trim().length > 0;
              const valid = isValidEmail(invite.email);
              const isConfirmed = hasEmail && valid;
              const domainMismatch =
                isConfirmed && creatorDomain && getDomain(invite.email) !== creatorDomain;
              const showPersonalNudge = isBoard && isConfirmed && isPersonalEmail(invite.email);

              return (
                <div
                  key={index}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    showPersonalNudge
                      ? "border-primary/30 bg-primary/5"
                      : domainMismatch
                        ? "border-[hsl(var(--havn-warning))]/40 bg-[hsl(var(--havn-warning))]/5"
                        : isConfirmed
                          ? "border-[hsl(var(--havn-success))]/30 bg-[hsl(var(--havn-success))]/5"
                          : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder={isBoard ? "boardmember@email.com" : "teammate@company.com"}
                        value={invite.email}
                        onChange={(e) => updateEmail(index, e.target.value)}
                        className="h-10 border-border bg-background pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                    {showPersonalNudge ? (
                      <Lightbulb className="h-5 w-5 shrink-0 text-primary" />
                    ) : domainMismatch ? (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-[hsl(var(--havn-warning))]" />
                    ) : isConfirmed ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(var(--havn-success))]" />
                    ) : null}
                    {invites.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {showPersonalNudge && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-primary/10 px-3 py-2">
                      <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      <p className="text-[11px] leading-snug text-primary">
                        This looks like a personal email. Consider using a shared or
                        association-specific email (e.g.{" "}
                        <span className="font-semibold">board@yourhoa.org</span>) so access
                        isn&apos;t tied to one person.
                      </p>
                    </div>
                  )}

                  {!showPersonalNudge && domainMismatch && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-[hsl(var(--havn-warning))]/10 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--havn-warning))]" />
                      <p className="text-[11px] leading-snug text-[hsl(var(--havn-warning))]">
                        This email uses a different domain than yours (
                        <span className="font-semibold">@{creatorDomain}</span>). Make sure this is
                        intentional.
                      </p>
                    </div>
                  )}

                  {isBoard ? (
                    <div className="mt-3 flex items-center gap-1.5">
                      <span className="mr-1 text-xs text-muted-foreground">Role:</span>
                      <span className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                        Admin
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        Full access to community & settings
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-muted-foreground">Role:</span>
                      <span className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                        Admin
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        Full portal access & settings
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {invites.length < MAX_INVITES && (
            <button
              type="button"
              onClick={addRow}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-havn-surface/30 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Add another ({invites.length}/{MAX_INVITES})
            </button>
          )}

          {invites.length >= MAX_INVITES && (
            <p className="text-center text-xs text-muted-foreground">
              Need more than 10? You can add additional {isBoard ? "board members" : "teammates"}{" "}
              anytime in <span className="font-semibold text-foreground">Settings -&gt; Team</span>.
            </p>
          )}

          <div className="rounded-lg border border-border bg-havn-surface/40 px-4 py-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isBoard ? (
                  <>
                    All invited board members will have{" "}
                    <span className="font-semibold text-foreground">Admin</span> access - full
                    control over the community and its settings. Roles can be changed later in{" "}
                    <span className="font-semibold text-foreground">Settings</span>.
                  </>
                ) : (
                  <>
                    All invited teammates will have{" "}
                    <span className="font-semibold text-foreground">Admin</span> access - full
                    control over communities and settings. Roles can be changed later in{" "}
                    <span className="font-semibold text-foreground">Settings</span>.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onSkip}
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-md border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-havn-surface"
            >
              Skip for now
            </button>
            <Button
              type="button"
              disabled={!hasValidEmails || isSubmitting}
              onClick={() => onFinish(validEmails)}
              className="h-11 flex-1 bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {isSubmitting ? "Sending..." : "Send invites & finish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
