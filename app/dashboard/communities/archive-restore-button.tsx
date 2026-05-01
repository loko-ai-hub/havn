"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { archiveCommunity } from "./actions";

export default function ArchiveRestoreCommunityButton({
  communityId,
  currentStatus,
}: {
  communityId: string;
  currentStatus: "active" | "archived";
}) {
  const router = useRouter();

  const isActive = currentStatus === "active";
  const nextStatus = isActive ? "archived" : "active";
  const verb = isActive ? "Archive" : "Restore";

  const handleClick = async () => {
    if (isActive) {
      // Archive is reversible but worth confirming, since it removes the
      // community from active listings everywhere.
      if (!window.confirm("Archive this community? You can restore it from the archived tab later.")) {
        return;
      }
    }
    const result = await archiveCommunity(communityId, nextStatus);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${verb}d.`);
    router.push("/dashboard/communities");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
    >
      {isActive ? <Archive className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
      {verb}
    </button>
  );
}

