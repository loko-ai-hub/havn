"use client";

import { Check, ChevronDown, UserCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { assignCommunityManager, type OrgUserOption } from "./actions";

type Props = {
  communityId: string;
  initialManagerId: string | null;
  orgUsers: OrgUserOption[];
};

export default function ManagerAssignmentCard({
  communityId,
  initialManagerId,
  orgUsers,
}: Props) {
  const [managerId, setManagerId] = useState<string | null>(initialManagerId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = orgUsers.find((u) => u.id === managerId) ?? null;

  const handleSelect = async (newId: string | null) => {
    if (newId === managerId) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await assignCommunityManager(communityId, newId);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setManagerId(newId);
      toast.success(
        newId
          ? `Manager assigned. The contact card will refresh on next load.`
          : "Manager assignment cleared."
      );
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCircle className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Assigned Manager
          </h4>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors"
          >
            {current ? "Change" : "Assign"}
          </button>
        )}
      </div>

      <div className="mt-3">
        {!editing ? (
          current ? (
            <div>
              <p className="text-sm font-medium text-foreground">{current.fullName}</p>
              <p className="text-xs text-muted-foreground">{current.email}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Management contact card is auto-populated from this user&apos;s
                profile and the management company&apos;s mailing address.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No manager assigned. Click Assign to pick a user from your team.
            </p>
          )
        ) : (
          <div className="space-y-2">
            <div className="max-h-64 overflow-auto rounded-lg border border-border bg-background">
              {orgUsers.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground italic">
                  No team members found. Invite users from Settings first.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {current && (
                    <li>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSelect(null)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-40"
                      >
                        <span className="text-xs font-medium text-destructive">
                          Clear assignment
                        </span>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </li>
                  )}
                  {orgUsers.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSelect(u.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {u.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {u.email}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {u.role}
                          </span>
                          {u.id === managerId && (
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
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* unused icon to keep tree-shake honest if we add a search later */}
      <ChevronDown className="hidden" />
    </div>
  );
}
