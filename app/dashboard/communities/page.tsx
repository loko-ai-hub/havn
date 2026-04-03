"use client";

import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Tab = "active" | "archived";

const PLACEHOLDER_COMMUNITY = {
  id: "placeholder-amlo",
  name: "AmLo Management",
  location: "Duvall, WA",
};

export default function DashboardCommunitiesPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [managerName, setManagerName] = useState("—");
  const [openRequestsCount, setOpenRequestsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const meta = user.user_metadata ?? {};
    const name =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      user.email?.split("@")[0] ||
      "—";
    setManagerName(name);

    let orgId: string | null =
      typeof user.user_metadata?.organization_id === "string"
        ? user.user_metadata.organization_id
        : null;

    if (!orgId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      orgId = profile?.organization_id ?? null;
    }

    if (orgId) {
      const { count, error } = await supabase
        .from("document_orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("order_status", "paid");

      if (!error && count != null) {
        setOpenRequestsCount(count);
      } else {
        setOpenRequestsCount(0);
      }
    } else {
      setOpenRequestsCount(0);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showRow = useMemo(() => {
    if (tab === "archived") return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = `${PLACEHOLDER_COMMUNITY.name} ${PLACEHOLDER_COMMUNITY.location}`.toLowerCase();
    return hay.includes(q);
  }, [tab, search]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-havn-amber/40 bg-havn-amber/15 px-4 py-3 text-sm text-foreground">
        <strong className="font-semibold">Communities are coming soon.</strong> This page will list all
        HOA/COA communities managed by your organization.
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Communities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage communities and monitor open requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => toast.info("Coming soon")}>
            Add Community
          </Button>
          <Button type="button" variant="outline" onClick={() => toast.info("Coming soon")}>
            Bulk Upload
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("active")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "active"
                ? "border-havn-navy bg-havn-navy text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setTab("archived")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "archived"
                ? "border-havn-navy bg-havn-navy text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            Archived
          </button>
        </div>
        <Input
          type="search"
          placeholder="Search communities…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm bg-background"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-0 bg-havn-surface/30 hover:bg-havn-surface/30">
              <TableHead className="text-muted-foreground">Community</TableHead>
              <TableHead className="text-muted-foreground">Units</TableHead>
              <TableHead className="text-muted-foreground">Open Requests</TableHead>
              <TableHead className="text-muted-foreground">Manager</TableHead>
              <TableHead className="text-muted-foreground">Docs Uploaded</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="w-[100px] text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : !showRow ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No communities match this filter.
                </TableCell>
              </TableRow>
            ) : (
              <TableRow className="cursor-default border-border hover:bg-muted/30">
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">{PLACEHOLDER_COMMUNITY.name}</p>
                    <p className="text-xs text-muted-foreground">{PLACEHOLDER_COMMUNITY.location}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell className="tabular-nums text-foreground">
                  {openRequestsCount ?? "—"}
                </TableCell>
                <TableCell className="text-foreground">{managerName}</TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
                <TableCell>
                  <span className="inline-flex rounded-full border border-havn-success/40 bg-havn-success/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                    Active
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => toast.info("Coming soon")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
