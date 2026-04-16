"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PortalOrder } from "@/lib/portal-data";
import { usePortalOrder } from "@/components/requester/RequesterPortalOrgContext";

export default function StepYourInfo({
  slug,
  order,
}: {
  slug: string;
  order: PortalOrder;
}) {
  const router = useRouter();
  const { updateOrder, updateEmails } = usePortalOrder();
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
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    brokerageName?: string;
    companyName?: string;
  }>({});

  const formatPhone = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleContinue = () => {
    const nextErrors: {
      name?: string;
      email?: string;
      phone?: string;
      brokerageName?: string;
      companyName?: string;
    } = {};
    if (!name.trim()) nextErrors.name = "Name is required.";
    if (!email.trim()) nextErrors.email = "Email is required.";
    else if (!isValidEmail(email)) nextErrors.email = "Please enter a valid email.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    updateOrder({
      requesterName: name,
      requesterEmail: email,
      requesterPhone: phone,
      brokerageName,
      licenseNumber,
      mlsId,
      companyName,
      nmlsNumber,
      additionalEmails,
    });
    updateEmails(additionalEmails);
    router.push(`/r/${slug}/property`);
  };

  const addAdditionalEmail = () => {
    const nextEmail = additionalEmailInputRef.current?.value.trim() ?? "";
    if (!nextEmail) return;
    if (additionalEmails.length >= 5) return;
    if (additionalEmails.includes(nextEmail)) return;
    const next = [...additionalEmails, nextEmail];
    setAdditionalEmails(next);
    updateEmails(next);
    if (additionalEmailInputRef.current) {
      additionalEmailInputRef.current.value = "";
    }
  };

  const removeAdditionalEmail = (index: number) => {
    const next = additionalEmails.filter((_, idx) => idx !== index);
    setAdditionalEmails(next);
    updateEmails(next);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Your Information
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We&apos;ll use this to process and deliver your documents.
      </p>

      <div className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="requesterName">Full name</Label>
          <Input
            id="requesterName"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (fieldErrors.name) {
                setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }
            }}
            placeholder="Jane Doe"
            className="bg-white"
          />
          {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="requesterEmail">Email</Label>
          <Input
            id="requesterEmail"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            placeholder="jane@example.com"
            className="bg-white"
          />
          {fieldErrors.email ? <p className="text-xs text-destructive">{fieldErrors.email}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="requesterPhone">
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="requesterPhone"
            value={phone}
            onChange={(event) => {
              setPhone(formatPhone(event.target.value));
              if (fieldErrors.phone) {
                setFieldErrors((prev) => ({ ...prev, phone: undefined }));
              }
            }}
            placeholder="(555) 123-4567"
            className="bg-white"
          />
          {fieldErrors.phone ? <p className="text-xs text-destructive">{fieldErrors.phone}</p> : null}
        </div>

        {order.requesterType === "buyer_agent" ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <p className="text-sm font-medium text-foreground">Agent details</p>
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">
                Agent license number <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
                placeholder="LIC-123456"
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brokerageName">
                Brokerage name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="brokerageName"
                value={brokerageName}
                onChange={(event) => {
                  setBrokerageName(event.target.value);
                  if (fieldErrors.brokerageName) {
                    setFieldErrors((prev) => ({ ...prev, brokerageName: undefined }));
                  }
                }}
                placeholder="Acme Realty"
                className="bg-white"
              />
              {fieldErrors.brokerageName ? (
                <p className="text-xs text-destructive">{fieldErrors.brokerageName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mlsId">
                MLS ID <span className="text-muted-foreground">(optional)</span>
              </Label>
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
              <Label htmlFor="companyName">
                Lender company name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(event) => {
                  setCompanyName(event.target.value);
                  if (fieldErrors.companyName) {
                    setFieldErrors((prev) => ({ ...prev, companyName: undefined }));
                  }
                }}
                placeholder="Acme Lending"
                className="bg-white"
              />
              {fieldErrors.companyName ? (
                <p className="text-xs text-destructive">{fieldErrors.companyName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanNumber">
                Loan number <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="loanNumber"
                value={nmlsNumber}
                onChange={(event) => setNmlsNumber(event.target.value)}
                placeholder="Loan reference or file number"
                className="bg-white"
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Additional recipients</p>
          <p className="text-xs text-muted-foreground">
            Add anyone else who should receive a copy of the completed documents
          </p>
          <div className="space-y-2">
            {additionalEmails.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {additionalEmails.map((additionalEmail, index) => (
                  <span
                    key={`${index}-${additionalEmail}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                  >
                    {additionalEmail}
                    <button
                      type="button"
                      onClick={() => removeAdditionalEmail(index)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
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
                disabled={additionalEmails.length >= 5}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </button>
            </div>
            {additionalEmails.length >= 5 ? (
              <p className="text-xs text-muted-foreground">
                Maximum reached: you can add up to 5 additional emails.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={() => router.push(`/r/${slug}/role`)}>
          Back
        </Button>
        <Button type="button" onClick={handleContinue} className="h-12 w-full bg-havn-navy text-base font-semibold text-white hover:bg-havn-navy-light">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
