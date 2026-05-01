"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { requestConciergeImport } from "./actions";

const MAX_PER_FILE_MB = 8;

type StagedFile = {
  filename: string;
  mimeType: string;
  base64: string;
  size: number;
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function ConciergeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const addFiles = async (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const next: StagedFile[] = [];
    for (const file of list) {
      if (file.size > MAX_PER_FILE_MB * 1024 * 1024) {
        toast.error(`${file.name} is over ${MAX_PER_FILE_MB}MB and was skipped.`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        next.push({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
          size: file.size,
        });
      } catch (err) {
        console.error("[concierge] failed to read file:", err);
        toast.error(`Could not read ${file.name}.`);
      }
    }
    if (next.length > 0) setFiles((prev) => [...prev, ...next]);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void addFiles(e.target.files);
    }
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const reset = () => {
    setFiles([]);
    setNotes("");
    setSubmitting(false);
    setIsDragging(false);
  };

  const handleSubmit = async () => {
    if (files.length === 0 && notes.trim().length === 0) {
      toast.error("Add a file or write a note before sending.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestConciergeImport({ notes, files });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "Sent! A Havn specialist will load your portfolio within 24 hours."
      );
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <div className="space-y-1 px-6 pt-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-havn-cyan-deep" />
            <DialogTitle>Have us load your portfolio</DialogTitle>
          </div>
          <DialogDescription>
            Drop any files describing your communities (spreadsheets, PDFs, exports
            from your existing system, even a written list). A Havn specialist will
            handle the rest within 24 hours.
          </DialogDescription>
        </div>

        <div className="space-y-4 px-6 pb-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              isDragging
                ? "border-havn-cyan bg-havn-cyan/5"
                : "border-border bg-havn-surface/30"
            }`}
          >
            <Paperclip className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drop files here, or{" "}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                choose files
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Up to {MAX_PER_FILE_MB}MB per file, 32MB total
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handleFileInput}
            />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.filename}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {file.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remove ${file.filename}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
              <li className="text-right text-xs text-muted-foreground">
                Total: {(totalBytes / 1024 / 1024).toFixed(1)}MB
              </li>
            </ul>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="concierge-notes"
              className="text-sm font-medium text-foreground"
            >
              Anything we should know?
            </label>
            <Textarea
              id="concierge-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'My portfolio is in Vantaca. Here's the export. Skip the Florida communities; those are managed by another company.'"
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || (files.length === 0 && notes.trim().length === 0)}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send to Havn
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
