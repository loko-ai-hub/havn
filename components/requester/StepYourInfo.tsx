"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PortalOrder } from "@/lib/portal-data";

export default function StepYourInfo({
  slug,
  order,
}: {
  slug: string;
  order: PortalOrder;
}) {
  const router = useRouter();
  const additionalEmailInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(order.requesterName);
  const [email, setEmail] = useState(order.requesterEmail);
  const [phone, setPhone] = useState(order.requesterPhone);
  const [brokerageName, setBrokerageName] = useState(order.brokerageName);
  const [licenseNumber, setLicenseNumber] = useState(order.licenseNumber);
  const [mlsId, setMlsId] = useState(order.mlsId);
  const [companyName, setCompanyName] = useState(order.companyName);
  const [nmlsNumber, setNmlsNumber] = useState(order.nmlsNumber);
  const [additionalEmails, setAdditionalEmails] = useState<string[]>(
    order.additionalEmails
  );
  const [error, setError] = useState<string | null>(null);

  const formatPhone = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleContinue = () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Please complete your name, email, and phone.");
      return;
    }
    if (order.requesterType === "buyer_agent" && !brokerageName.trim()) {
      setError("Brokerage Name is required for buyer's agents.");
      return;
    }
    if (order.requesterType === "lender_title" && !companyName.trim()) {
      setError("Company Name is required for lenders/title companies.");
      return;
    }
    setError(null);
    router.push(`/r/${slug}/property`);
  };

  const addAdditionalEmail = () => {
    const nextEmail = additionalEmailInputRef.current?.value.trim() ?? "";
    if (!nextEmail) return;
    setAdditionalEmails((prev) => {
      if (prev.length >= 5) return prev;
      if (prev.includes(nextEmail)) return prev;
      return [...prev, nextEmail];
    });
    if (additionalEmailInputRef.current) {
      additionalEmailInputRef.current.value = "";
    }
  };

  const removeAdditionalEmail = (index: number) => {
    setAdditionalEmails((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Your information
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We&apos;ll use this for order updates and delivery notifications.
      </p>

      <div className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="requesterName">Full name</Label>
          <Input
            id="requesterName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jane Doe"
            className="bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="requesterEmail">Email</Label>
          <Input
            id="requesterEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="jane@example.com"
            className="bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="requesterPhone">Phone</Label>
          <Input
            id="requesterPhone"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            placeholder="(555) 123-4567"
            className="bg-white"
          />
        </div>

        {order.requesterType === "buyer_agent" ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <p className="text-sm font-medium text-foreground">Agent details</p>
            <div className="space-y-2">
              <Label htmlFor="brokerageName">Brokerage Name</Label>
              <Input
                id="brokerageName"
                value={brokerageName}
                onChange={(event) => setBrokerageName(event.target.value)}
                placeholder="Acme Realty"
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
                placeholder="LIC-123456"
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mlsId">MLS ID</Label>
              <Input
                id="mlsId"
                value={mlsId}
                onChange={(event) => setMlsId(event.target.value)}
                placeholder="MLS-10001"
                className="bg-white"
              />
            </div>
          </div>
        ) : null}

        {order.requesterType === "lender_title" ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <p className="text-sm font-medium text-foreground">Lender details</p>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Acme Lending"
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nmlsNumber">NMLS Number</Label>
              <Input
                id="nmlsNumber"
                value={nmlsNumber}
                onChange={(event) => setNmlsNumber(event.target.value)}
                placeholder="NMLS-10001"
                className="bg-white"
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Also send documents to</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                ref={additionalEmailInputRef}
                type="email"
                placeholder="optional@recipient.com"
                className="bg-white"
              />
              <button
                type="button"
                onClick={addAdditionalEmail}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </button>
            </div>
            {additionalEmails.map((additionalEmail, index) => (
              <div key={`${index}-${additionalEmail}`} className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2">
                <p className="flex-1 text-sm text-foreground">{additionalEmail}</p>
                <button
                  type="button"
                  onClick={() => removeAdditionalEmail(index)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => router.push(`/r/${slug}/role`)}>
          Back
        </Button>
        <Button type="button" onClick={handleContinue} className="bg-havn-navy text-white hover:bg-havn-navy-light">
          Continue
        </Button>
      </div>
    </div>
  );
}
