"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { attachThirdPartyForm } from "../actions";

export default function AttachThirdPartyFormButton({
  orderId,
}: {
  orderId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePick = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await attachThirdPartyForm(orderId, fd);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.ingestionWarning) {
        toast.warning(`Form attached, but ingestion didn't complete: ${result.ingestionWarning}`);
      } else {
        toast.success("Form attached and ingested. Match results are ready.");
      }
      router.refresh();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={handlePick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        title="Upload a PDF or DOCX 3P form to attach to this order. Triggers OCR + Claude extraction + Form Parser layout capture, same pipeline as a fresh requester upload."
      >
        <Paperclip className="h-4 w-4" />
        {busy ? "Attaching…" : "Attach 3P form"}
      </button>
    </>
  );
}
