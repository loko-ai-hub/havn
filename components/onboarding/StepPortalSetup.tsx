"use client";

import { useState, useRef, type DragEvent } from "react";
import { Upload, ExternalLink, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PortalSetupData {
  logoDataUrl: string | null;
  brandColor: string;
  welcomeMessage: string;
}

interface StepPortalSetupProps {
  onContinue: (data: PortalSetupData) => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

const DEFAULT_WELCOME =
  "Please complete the form below to request and obtain your community documents, certificates, and account information.";

const StepPortalSetup = ({ onContinue, onSkip, isSubmitting = false }: StepPortalSetupProps) => {
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState("");
  const [brandColor, setBrandColor] = useState("#4f8eff");
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.type.match(/^image\/(png|jpe?g|svg\+xml)$/)) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoDataUrl(e.target?.result as string);
      setLogoFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="flex h-full justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Customize your portal
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your branding so residents see your brand, not ours.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Your logo</Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : logoDataUrl
                    ? "border-border bg-background"
                    : "border-border bg-havn-surface/30 hover:border-muted-foreground/40"
              }`}
            >
              {logoDataUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <img src={logoDataUrl} alt="Logo preview" className="h-16 max-w-[200px] object-contain" />
                  <p className="text-xs text-muted-foreground">{logoFileName}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLogoDataUrl(null);
                      setLogoFileName("");
                    }}
                    className="text-xs font-medium text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Drag & drop or click to upload</p>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, or SVG</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended: square or horizontal, transparent background.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brandColor" className="text-sm font-medium text-foreground">
              Primary brand color
            </Label>
            <div
              onClick={() => colorInputRef.current?.click()}
              className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-muted-foreground/50 hover:bg-havn-surface/30"
            >
              <div className="relative">
                <div
                  className="h-10 w-10 rounded-lg border-2 border-border shadow-sm transition-shadow group-hover:shadow-md"
                  style={{ backgroundColor: brandColor }}
                />
                <div className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{brandColor.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">Click to change</p>
              </div>
              <Input
                id="brandColor"
                type="text"
                value={brandColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setBrandColor(v);
                }}
                onClick={(e) => e.stopPropagation()}
                maxLength={7}
                className="h-9 w-28 border-border bg-background font-mono text-xs text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Used for buttons, highlights, and accents across the resident portal.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcomeMsg" className="text-sm font-medium text-foreground">
              Welcome message
            </Label>
            <Textarea
              id="welcomeMsg"
              placeholder="e.g. Your community, always connected."
              value={welcomeMessage}
              onChange={(e) => {
                if (e.target.value.length <= 160) setWelcomeMessage(e.target.value);
              }}
              rows={3}
              className="resize-none border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Shown as a subtitle on your portal homepage.
              </p>
              <span
                className={`text-xs tabular-nums ${
                  welcomeMessage.length >= 150 ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {welcomeMessage.length}/160
              </span>
            </div>
          </div>

          <a
            href="/portal/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-havn-surface/30 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-havn-surface/60"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            Preview what your portal looks like
          </a>

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
              onClick={() => onContinue({ logoDataUrl, brandColor, welcomeMessage })}
              disabled={isSubmitting}
              className="h-11 flex-1 bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isSubmitting ? "Saving..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepPortalSetup;
