"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { archiveCommunity } from "./actions";

export default function ArchiveRestoreCommunityButton({
  communityId,
  currentStatus,
}: {
  communityId: string;
  currentStatus: "active" | "archived";
}) {
  const router = useRouter();

  const nextStatus = currentStatus === "active" ? "archived" : "active";
  const label = currentStatus === "active" ? "Archive Community" : "Restore Community";

  const handleClick = async () => {
    const result = await archiveCommunity(communityId, nextStatus);
    if (result && "error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(label.replace(" Community", "") + " updated.");
    router.push("/dashboard/communities");
    router.refresh();
  };

  return (
    <Button type="button" variant="destructive" className="w-full sm:w-auto" onClick={() => void handleClick()}>
      {label}
    </Button>
  );
}

