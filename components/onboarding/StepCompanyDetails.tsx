"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { ArrowRight, X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import type { AccountType } from "./StepAccountType";
import { US_STATES } from "@/lib/us-states";
import { createClient } from "@/lib/supabase/client";
import { loadEnabledStates } from "@/lib/enabled-states-action";
import { saveOnboardingDraft, debounce } from "@/lib/onboarding-draft";

export interface CompanyDetailsData {
  companyName: string;
  portalSlug: string;
  supportPhone: string;
  supportEmail: string;
  city: string;
  zip: string;
  state: string;
  isMultiState: boolean;
  additionalStates: string[];
  managementSoftware: string;
  managementSoftwareOther: string;
}

interface StepCompanyDetailsProps {
  accountType: AccountType;
  onContinue: (data: CompanyDetailsData) => void;
  isSubmitting?: boolean;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const PERSONAL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "live.com",
  "msn.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "zoho.com",
  "ymail.com",
  "comcast.net",
  "att.net",
  "verizon.net",
  "cox.net",
];

const isPersonalEmail = (email: string) => {
  const match = email.trim().match(/@(.+)$/);
  const domain = match ? match[1].toLowerCase() : "";
  return PERSONAL_DOMAINS.includes(domain);
};

const MANAGEMENT_SOFTWARE_OPTIONS = [
  { value: "appfolio", label: "AppFolio" },
  { value: "buildium", label: "Buildium" },
  { value: "caliber", label: "CALIBER" },
  { value: "cinc", label: "CINC Systems" },
  { value: "enumerate", label: "Enumerate (Pillera)" },
  { value: "frontsteps", label: "Frontsteps (Caliber)" },
  { value: "jenark", label: "Jenark" },
  { value: "payhoa", label: "PayHOA" },
  { value: "propertyware", label: "Propertyware" },
  { value: "realmanage", label: "RealManage" },
  { value: "smartwebs", label: "Smartwebs" },
  { value: "strongroom", label: "Strongroom" },
  { value: "tops", label: "TOPS [ONE]" },
  { value: "vantaca", label: "Vantaca" },
  { value: "village_mgmt", label: "Village Management Software" },
  { value: "yardi", label: "Yardi Voyager" },
  { value: "none", label: "We don't use any software" },
  { value: "other", label: "Other" },
];

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
);

const FieldLabel = ({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) => (
  <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
    {children}
    {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
  </Label>
);

const StepCompanyDetails = ({
  accountType,
  onContinue,
  isSubmitting = false,
}: StepCompanyDetailsProps) => {
  const [companyName, setCompanyName] = useState("");
  const [portalSlug, setPortalSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [isMultiState, setIsMultiState] = useState<boolean | null>(null);
  const [additionalStates, setAdditionalStates] = useState<string[]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [managementSoftware, setManagementSoftware] = useState("");
  const [otherSoftware, setOtherSoftware] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [enabledStates, setEnabledStates] = useState<Set<string> | null>(null);
  const [existingOrgId, setExistingOrgId] = useState<string | null>(null);

  // Persist partial form state so operators can see drop-off data (email, company,
  // state, incumbent software) even when a user abandons before clicking Continue.
  const debouncedDraftSave = useMemo(
    () =>
      debounce((...args: unknown[]) => {
        void saveOnboardingDraft(args[0] as Parameters<typeof saveOnboardingDraft>[0]);
      }, 500),
    []
  );

  useEffect(() => {
    debouncedDraftSave({
      step: 2,
      company_name: companyName || undefined,
      portal_slug: portalSlug || undefined,
      support_email: supportEmail || undefined,
      support_phone: supportPhone || undefined,
      city: city || undefined,
      state: state || undefined,
      zip: zip || undefined,
      management_software: managementSoftware || undefined,
      management_software_other:
        managementSoftware === "other" ? otherSoftware || undefined : undefined,
      is_multi_state: isMultiState ?? undefined,
      additional_states: additionalStates.length > 0 ? additionalStates : undefined,
    });
  }, [
    companyName,
    portalSlug,
    supportEmail,
    supportPhone,
    city,
    state,
    zip,
    managementSoftware,
    otherSoftware,
    isMultiState,
    additionalStates,
    debouncedDraftSave,
  ]);

  useEffect(() => {
    void loadEnabledStates().then((states) => setEnabledStates(new Set(states)));
    // Pre-populate email from auth session and fetch any existing org the user
    // already owns (e.g. from a prior, interrupted onboarding attempt) so the
    // slug availability check doesn't flag their own reserved slug as "taken".
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email && !supportEmail) {
        setSupportEmail(user.email);
      }
      const metadataOrgId = (user?.user_metadata as { organization_id?: string } | null)
        ?.organization_id;
      if (metadataOrgId) {
        setExistingOrgId(metadataOrgId);
      } else if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.organization_id) {
          setExistingOrgId(profile.organization_id as string);
        }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!portalSlug || portalSlug.length < 2) {
      setSlugStatus("idle");
      return;
    }

    setSlugStatus("checking");
    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      let query = supabase
        .from("organizations")
        .select("id")
        .eq("portal_slug", portalSlug);
      if (existingOrgId) {
        query = query.neq("id", existingOrgId);
      }
      const { data, error } = await query.maybeSingle();

      if (error) {
        setSlugStatus("available");
        return;
      }
      setSlugStatus(data ? "taken" : "available");
    }, 600);

    return () => window.clearTimeout(timer);
  }, [portalSlug, existingOrgId]);

  const handleCompanyNameChange = useCallback(
    (value: string) => {
      setCompanyName(value);
      if (!slugManuallyEdited) {
        setPortalSlug(slugify(value));
      }
    },
    [slugManuallyEdited]
  );

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setPortalSlug(slugify(value));
  };

  const toggleAdditionalState = (abbr: string) => {
    setAdditionalStates((prev) =>
      prev.includes(abbr) ? prev.filter((s) => s !== abbr) : [...prev, abbr]
    );
  };

  const filteredStates = useMemo(
    () =>
      US_STATES.filter(
        (s) =>
          (!enabledStates || enabledStates.has(s.abbr)) &&
          s.abbr !== state &&
          !additionalStates.includes(s.abbr) &&
          (s.name.toLowerCase().includes(stateSearch.toLowerCase()) ||
            s.abbr.toLowerCase().includes(stateSearch.toLowerCase()))
      ),
    [state, stateSearch, additionalStates, enabledStates]
  );

  const isCompany = accountType === "management_company";

  const slugReady = portalSlug.length >= 2 && slugStatus === "available";

  const baseValid =
    companyName.trim().length > 0 &&
    slugReady &&
    supportPhone.trim().length > 0 &&
    supportEmail.trim().length > 0 &&
    state.length > 0;

  const isValid = isCompany
    ? baseValid && isMultiState !== null && (isMultiState === false || additionalStates.length > 0)
    : baseValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onContinue({
      companyName,
      portalSlug,
      supportPhone,
      supportEmail,
      city,
      zip,
      state,
      isMultiState: isCompany ? (isMultiState ?? false) : false,
      additionalStates:
        isCompany && isMultiState ? [state, ...additionalStates.filter((s) => s !== state)] : [],
      managementSoftware,
      managementSoftwareOther: managementSoftware === "other" ? otherSoftware : "",
    });
  };

  return (
    <div className="flex h-full justify-center overflow-y-auto px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isCompany ? "Set up your company" : "Set up your association"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;ll use this to set up your {isCompany ? "management" : "association"} portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <SectionHeader>Your Information</SectionHeader>
            <div className="space-y-2">
              <FieldLabel htmlFor="supportEmail">Your Email</FieldLabel>
              <Input
                id="supportEmail"
                type="email"
                placeholder={isCompany ? "you@yourcompany.com" : "you@yourassociation.com"}
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                readOnly={!!supportEmail}
                className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring read-only:bg-muted/50 read-only:text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground">You can add additional team emails after completing setup in Settings.</p>
              {supportEmail.trim().length > 0 && isPersonalEmail(supportEmail) && (
                <div className="rounded-md border border-havn-amber/40 bg-havn-amber/15 px-3 py-2 text-xs leading-snug text-foreground">
                  {isCompany ? (
                    <>
                      This looks like a personal email. Consider using your company email for a more
                      professional appearance.
                    </>
                  ) : (
                    <>
                      This looks like a personal email. Consider using a shared or association-specific
                      email (e.g. <span className="font-semibold">board@yourhoa.org</span>) so access
                      isn&apos;t tied to one person.
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="supportPhone">Your Office Phone</FieldLabel>
              <Input
                id="supportPhone"
                type="tel"
                placeholder="(555) 123-4567"
                value={supportPhone}
                onChange={(e) => setSupportPhone(formatPhone(e.target.value))}
                className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeader>{isCompany ? "Company Details" : "Association Details"}</SectionHeader>
            <div className="space-y-2">
              <FieldLabel htmlFor="companyName">
                {isCompany ? "Company Name" : "Association Name"}
              </FieldLabel>
              <Input
                id="companyName"
                type="text"
                placeholder={isCompany ? "ABC Management" : "Oak Creek HOA"}
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="portalSlug">Portal URL</FieldLabel>
              <div className="flex h-11 items-center overflow-hidden rounded-md border border-border">
                <span className="select-none border-r border-border bg-havn-surface px-3 text-sm text-muted-foreground">
                  havnhq.com/r/
                </span>
                <input
                  id="portalSlug"
                  type="text"
                  value={portalSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder={isCompany ? "your-company" : "your-association"}
                  className="h-full flex-1 bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {slugStatus === "checking" && (
                  <Loader2 className="mr-3 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                )}
                {slugStatus === "available" && (
                  <CheckCircle2 className="mr-3 h-4 w-4 shrink-0 text-[hsl(var(--havn-success))]" />
                )}
                {slugStatus === "taken" && (
                  <XCircle className="mr-3 h-4 w-4 shrink-0 text-destructive" />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Full link:{" "}
                <span className="font-medium text-foreground">
                  havnhq.com/r/{portalSlug || "your-slug"}
                </span>
              </p>
              {slugStatus === "available" && (
                <p className="text-xs text-[hsl(var(--havn-success))]">This URL is available</p>
              )}
              {slugStatus === "taken" && (
                <p className="text-xs text-destructive">This URL is already taken - try another</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeader>{isCompany ? "Primary Office Location" : "Association Location"}</SectionHeader>
            <div className="space-y-2">
              <FieldLabel htmlFor="city" optional>
                City
              </FieldLabel>
              <Input
                id="city"
                type="text"
                placeholder="Seattle"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <FieldLabel htmlFor="state">State</FieldLabel>
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">-</option>
                  {US_STATES.filter((s) => !enabledStates || enabledStates.has(s.abbr)).map((s) => (
                    <option key={s.abbr} value={s.abbr}>
                      {s.abbr}
                    </option>
                  ))}
                </select>
                {enabledStates && enabledStates.size > 0 && enabledStates.size < 50 && (
                  <p className="text-[11px] text-muted-foreground">
                    Havn is currently available in {enabledStates.size} state{enabledStates.size === 1 ? "" : "s"}. More coming soon.
                  </p>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <FieldLabel htmlFor="zip" optional>
                  ZIP
                </FieldLabel>
                <Input
                  id="zip"
                  type="text"
                  inputMode="numeric"
                  placeholder="98101"
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/[^0-9-]/g, "").slice(0, 10))}
                  className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </div>

          {isCompany && (
            <div className="space-y-3">
              <SectionHeader>Service Area</SectionHeader>
              <p className="text-sm text-muted-foreground">Do you manage communities in multiple states?</p>
              <div className="space-y-2">
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    isMultiState === false
                      ? "border-foreground bg-havn-surface/60"
                      : "border-border hover:bg-havn-surface/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="isMultiState"
                    value="no"
                    checked={isMultiState === false}
                    onChange={() => setIsMultiState(false)}
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      No, just{" "}
                      {state ? (US_STATES.find((s) => s.abbr === state)?.name ?? state) : "one state"}
                    </span>
                    <p className="text-xs text-muted-foreground">We&apos;ll tailor fee limits to your state&apos;s laws</p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    isMultiState === true
                      ? "border-foreground bg-havn-surface/60"
                      : "border-border hover:bg-havn-surface/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="isMultiState"
                    value="yes"
                    checked={isMultiState === true}
                    onChange={() => setIsMultiState(true)}
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">Yes, we operate in multiple states</span>
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll show fee limits for all applicable states
                    </p>
                  </div>
                </label>
              </div>

              {isMultiState && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Select all states you currently operate in</p>
                  <div className="flex flex-wrap gap-2">
                    {state && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground">
                        {state} - {US_STATES.find((s) => s.abbr === state)?.name}
                        <span className="ml-0.5 text-[10px] text-muted-foreground">Primary</span>
                      </span>
                    )}
                    {additionalStates.map((abbr) => (
                      <button
                        key={abbr}
                        type="button"
                        onClick={() => toggleAdditionalState(abbr)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-havn-surface/60 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10"
                      >
                        {abbr} - {US_STATES.find((s) => s.abbr === abbr)?.name}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                  <Input
                    type="text"
                    placeholder="Search states..."
                    value={stateSearch}
                    onChange={(e) => setStateSearch(e.target.value)}
                    className="h-9 border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                    {filteredStates.map((s) => {
                      const selected = additionalStates.includes(s.abbr);
                      return (
                        <button
                          key={s.abbr}
                          type="button"
                          onClick={() => toggleAdditionalState(s.abbr)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                            selected
                              ? "bg-primary/10 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-havn-surface/30 hover:text-foreground"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            }`}
                          >
                            {selected && "✓"}
                          </span>
                          <span>
                            {s.abbr} - {s.name}
                          </span>
                        </button>
                      );
                    })}
                    {filteredStates.length === 0 && (
                      <p className="px-4 py-3 text-xs text-muted-foreground">No states match your search</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {isCompany && (
            <div className="space-y-3">
              <div>
                <FieldLabel htmlFor="managementSoftware" optional>
                  Management Software
                </FieldLabel>
                <p className="mt-1 text-sm text-muted-foreground">
                  What software do you currently use? This helps us prioritize integrations.
                </p>
              </div>
              <select
                id="managementSoftware"
                value={managementSoftware}
                onChange={(e) => setManagementSoftware(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Select your software…</option>
                {MANAGEMENT_SOFTWARE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {managementSoftware === "other" && (
                <Input
                  type="text"
                  placeholder="Tell us what you use…"
                  value={otherSoftware}
                  onChange={(e) => setOtherSoftware(e.target.value)}
                  className="h-11 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                />
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {isSubmitting ? "Saving..." : "Continue"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default StepCompanyDetails;
