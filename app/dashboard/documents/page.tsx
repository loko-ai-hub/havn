"use client";

import { FileText } from "lucide-react";

export default function DashboardDocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">Community document library</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="community-select" className="text-xs font-medium text-muted-foreground">
            Community
          </label>
          <select
            id="community-select"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            defaultValue="all"
          >
            <option value="all">All Communities</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center">
        <FileText className="h-14 w-14 text-muted-foreground" aria-hidden />
        <h2 className="mt-6 text-lg font-semibold text-foreground">Document management coming soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Upload and manage governing documents, CC&Rs, insurance certificates, and more for each
          community.
        </p>
      </div>
    </div>
  );
}
