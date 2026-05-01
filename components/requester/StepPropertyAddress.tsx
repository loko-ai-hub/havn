"use client";

import { useMemo, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { US_STATES } from "@/lib/us-states";
import { usePortalOrder } from "@/components/requester/RequesterPortalOrgContext";

type AddressForm = {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
};

const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const PO_BOX_REGEX = /\b(p\.?\s*o\.?\s*box|post\s+office\s+box)\b/i;

export default function StepPropertyAddress({ slug, primaryColor = "#1B2B4B" }: { slug: string; primaryColor?: string }) {
  const router = useRouter();
  const { order, updateOrder } = usePortalOrder();
  const [form, setForm] = useState<AddressForm>({
    street: order.propertyAddress,
    unit: order.unitNumber,
    city: order.city,
    state: order.state,
    zip: order.zip,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  }>({});

  const enteredAddress = useMemo(
    () => ({
      ...form,
      street: form.street.trim(),
      unit: form.unit.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
    }),
    [form]
  );

  const validate = () => {
    const nextErrors: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    } = {};
    if (!enteredAddress.street) nextErrors.street = "Street Address is required.";
    if (!enteredAddress.city) nextErrors.city = "City is required.";
    if (!enteredAddress.state) nextErrors.state = "State is required.";
    if (!enteredAddress.zip) nextErrors.zip = "ZIP Code is required.";
    else if (!ZIP_REGEX.test(enteredAddress.zip)) {
      nextErrors.zip = "ZIP Code must be in 12345 or 12345-6789 format.";
    }
    if (PO_BOX_REGEX.test(enteredAddress.street)) {
      nextErrors.street = "PO Boxes are not supported. Please enter a physical property address.";
    }
    return nextErrors;
  };

  const handleContinue = () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    setFieldErrors({});
    setError(null);

    updateOrder({
      propertyAddress: enteredAddress.street,
      unitNumber: enteredAddress.unit,
      city: enteredAddress.city,
      state: enteredAddress.state,
      zip: enteredAddress.zip,
    });
    router.push(`/r/${slug}/documents`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Property Address</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the property address for this document request.
      </p>

      <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="street"
                value={form.street}
                onChange={(e) => {
                  const nextStreet = e.target.value;
                  setForm((prev) => ({ ...prev, street: nextStreet }));
                  if (error) setError(null);
                  if (fieldErrors.street) {
                    setFieldErrors((prev) => ({ ...prev, street: undefined }));
                  }
                }}
                placeholder="123 Main Street"
                className="bg-white pl-10"
              />
            </div>
            {fieldErrors.street ? <p className="text-xs text-destructive">{fieldErrors.street}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">
              Unit/Lot Number <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="unit"
              value={form.unit}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, unit: e.target.value }));
                if (error) setError(null);
              }}
              placeholder="Unit 4B"
              className="bg-white"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, city: e.target.value }));
                  if (error) setError(null);
                  if (fieldErrors.city) {
                    setFieldErrors((prev) => ({ ...prev, city: undefined }));
                  }
                }}
                placeholder="Seattle"
                className="bg-white"
              />
              {fieldErrors.city ? <p className="text-xs text-destructive">{fieldErrors.city}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                value={form.state}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, state: e.target.value }));
                  if (error) setError(null);
                  if (fieldErrors.state) {
                    setFieldErrors((prev) => ({ ...prev, state: undefined }));
                  }
                }}
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select</option>
                {US_STATES.map((state) => (
                  <option key={state.abbr} value={state.abbr}>
                    {state.abbr}
                  </option>
                ))}
              </select>
              {fieldErrors.state ? <p className="text-xs text-destructive">{fieldErrors.state}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                value={form.zip}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, zip: e.target.value }));
                  if (error) setError(null);
                  if (fieldErrors.zip) {
                    setFieldErrors((prev) => ({ ...prev, zip: undefined }));
                  }
                }}
                placeholder="98101"
                className="bg-white"
              />
              {fieldErrors.zip ? <p className="text-xs text-destructive">{fieldErrors.zip}</p> : null}
            </div>
          </div>
        </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex flex-row gap-3">
        <Button type="button" variant="outline" className="h-12 flex-1 text-base" onClick={() => router.push(`/r/${slug}/info`)}>
          Back
        </Button>
        <Button type="button" className="h-12 flex-1 text-base font-semibold text-white hover:opacity-90" style={{ backgroundColor: primaryColor }} onClick={handleContinue}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
