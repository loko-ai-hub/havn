"use client";

import { RotateCcw } from "lucide-react";
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

import { refundOrder } from "../actions";
import { formatCurrency } from "../../_lib/format";

export default function RefundButton({
  orderId,
  totalFee,
}: {
  orderId: string;
  totalFee: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");

  const amountLabel = formatCurrency(totalFee);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await refundOrder(orderId, reason);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Refund initiated. Order status will update shortly.");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
      >
        <RotateCcw className="h-4 w-4" />
        Refund
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refund {amountLabel}?</DialogTitle>
            <DialogDescription>
              This refunds the full order total to the requester, reverses the transfer from
              your connected Stripe account, and returns Havn&rsquo;s platform fee
              proportionally. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Reason for refund (optional — stored on the Stripe refund for audit)…"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Refunding…" : `Refund ${amountLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
