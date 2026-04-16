"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { fulfillOrder, rejectOrder } from "./actions";

export default function ApproveRejectButtons({
  orderId,
  alreadyFulfilled,
}: {
  orderId: string;
  alreadyFulfilled: boolean;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (alreadyFulfilled) return null;

  const handleApprove = async () => {
    setApproving(true);
    try {
      const result = await fulfillOrder(orderId);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Order approved and marked fulfilled.");
      router.push("/dashboard/requests");
      router.refresh();
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSubmit = async () => {
    setRejecting(true);
    try {
      const result = await rejectOrder(orderId, reason);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Order rejected.");
      setRejectOpen(false);
      router.push("/dashboard/requests");
      router.refresh();
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={approving}
          onClick={() => void handleApprove()}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-havn-success px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-havn-success/90 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          {approving ? "Approving…" : "Approve & Send"}
        </button>
        <button
          type="button"
          onClick={() => { setReason(""); setRejectOpen(true); }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <XCircle className="h-4 w-4" />
          Reject
        </button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this request?</DialogTitle>
            <DialogDescription>
              The requester will receive an email with your reason. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Reason for rejection (optional but recommended)…"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejecting}
              onClick={() => void handleRejectSubmit()}
            >
              {rejecting ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
