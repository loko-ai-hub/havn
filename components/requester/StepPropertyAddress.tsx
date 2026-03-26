"use client";

import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { US_STATES } from "@/lib/us-states";

type AddressForm = {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
};

type ConfirmChoice = "suggested" | "entered" | null;

const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const PO_BOX_REGEX = /\b(p\.?\s*o\.?\s*box|post\s+office\s+box)\b/i;

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeStreet(street: string): string {
  const replacements: Record<string, string> = {
    "\\bStreet\\b": "St",
    "\\bAvenue\\b": "Ave",
    "\\bRoad\\b": "Rd",
    "\\bDrive\\b": "Dr",
    "\\bLane\\b": "Ln",
    "\\bBoulevard\\b": "Blvd",
    "\\bCourt\\b": "Ct",
    "\\bPlace\\b": "Pl",
  };

  let normalized = street.trim().replace(/\s+/g, " ");
  Object.entries(replacements).forEach(([pattern, replacement]) => {
    normalized = normalized.replace(new RegExp(pattern, "gi"), replacement);
  });
  return normalized;
}

function buildSuggestedAddress(input: AddressForm): AddressForm {
  const next = {
    ...input,
    street: normalizeStreet(input.street),
    city: titleCase(input.city.trim()),
  };
  if (/^\d{5}$/.test(next.zip)) {
    next.zip = `${next.zip}-1234`;
  }
  return next;
}

function addressesDiffer(a: AddressForm, b: AddressForm): boolean {
  return (
    a.street !== b.street ||
    a.unit !== b.unit ||
    a.city !== b.city ||
    a.state !== b.state ||
    a.zip !== b.zip
  );
}

function AddressCard({
  title,
  address,
  selected,
  onSelect,
}: {
  title: string;
  address: AddressForm;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-xl border-2 p-4 text-left transition-colors",
        selected
          ? "border-havn-success bg-havn-success/10"
          : "border-border bg-card hover:border-havn-success/50",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
        <p>{address.street}</p>
        {address.unit ? <p>{address.unit}</p> : null}
        <p>
          {address.city}, {address.state} {address.zip}
        </p>
      </div>
    </button>
  );
}

export default function StepPropertyAddress({ slug }: { slug: string }) {
  const router = useRouter();
  const [form, setForm] = useState<AddressForm>({
    street: "",
    unit: "",
    city: "",
    state: "",
    zip: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [choice, setChoice] = useState<ConfirmChoice>(null);
  const [suggestedAddress, setSuggestedAddress] = useState<AddressForm | null>(null);

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

  const validate = (): string | null => {
    if (!enteredAddress.street || !enteredAddress.city || !enteredAddress.state || !enteredAddress.zip) {
      return "Please complete all required address fields.";
    }
    if (PO_BOX_REGEX.test(enteredAddress.street)) {
      return "PO Boxes are not supported. Please enter a physical property address.";
    }
    if (!ZIP_REGEX.test(enteredAddress.zip)) {
      return "ZIP Code must be in 12345 or 12345-6789 format.";
    }
    return null;
  };

  const handleContinue = () => {
    if (confirming) {
      if (!choice) {
        setError("Please select Suggested or As entered to continue.");
        return;
      }
      setError(null);
      router.push(`/r/${slug}/documents`);
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const suggestion = buildSuggestedAddress(enteredAddress);
    if (addressesDiffer(enteredAddress, suggestion)) {
      setSuggestedAddress(suggestion);
      setConfirming(true);
      setChoice(null);
      setError(null);
      return;
    }

    router.push(`/r/${slug}/documents`);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Property Address</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the property address for this document request.
      </p>

      {!confirming ? (
        <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="street"
                value={form.street}
                onChange={(e) => setForm((prev) => ({ ...prev, street: e.target.value }))}
                placeholder="123 Main Street"
                className="bg-white pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Unit/Lot Number (optional)</Label>
            <Input
              id="unit"
              value={form.unit}
              onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
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
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="Seattle"
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                value={form.state}
                onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select</option>
                {US_STATES.map((state) => (
                  <option key={state.abbr} value={state.abbr}>
                    {state.abbr}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                value={form.zip}
                onChange={(e) => setForm((prev) => ({ ...prev, zip: e.target.value }))}
                placeholder="98101"
                className="bg-white"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          <div className="rounded-xl border border-havn-amber bg-havn-amber/10 p-4">
            <p className="text-sm font-medium text-foreground">Please confirm this property address</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We found a suggested formatting update. Choose which version you want to continue with.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {suggestedAddress ? (
              <AddressCard
                title="Suggested"
                address={suggestedAddress}
                selected={choice === "suggested"}
                onSelect={() => {
                  setChoice("suggested");
                  setError(null);
                }}
              />
            ) : null}
            <AddressCard
              title="As entered"
              address={enteredAddress}
              selected={choice === "entered"}
              onSelect={() => {
                setChoice("entered");
                setError(null);
              }}
            />
          </div>
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.push(`/r/${slug}/info`)}>
          Back
        </Button>
        <Button type="button" className="flex-1 bg-havn-navy text-white hover:bg-havn-navy-light" onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
