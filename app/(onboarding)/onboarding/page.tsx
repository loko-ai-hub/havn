"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import OnboardingSidebar from "@/components/onboarding/OnboardingSidebar";
import StepAccountType, { type AccountType } from "@/components/onboarding/StepAccountType";
import StepCompanyDetails, {
  type CompanyDetailsData,
} from "@/components/onboarding/StepCompanyDetails";
import StepFees, { type FeesData } from "@/components/onboarding/StepFees";
import StepPortalSetup, { type PortalSetupData } from "@/components/onboarding/StepPortalSetup";
import StepInviteAdmins from "@/components/onboarding/StepInviteAdmins";
import ValuePropsList from "@/components/onboarding/ValuePropsList";
import { createClient } from "@/lib/supabase/client";
import { saveOnboardingDraft } from "@/lib/onboarding-draft";

// Dev-only: bypasses org checks so onboarding steps can be tested individually
const DEV_ONBOARDING_BYPASS = process.env.NODE_ENV === "development";

const OnboardingPage = () => {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [currentStep, setCurrentStep] = useState(1);
  const [accountType, setAccountType] = useState<AccountType>("management_company");
  const [companyState, setCompanyState] = useState("");
  const [isMultiState, setIsMultiState] = useState(false);
  const [additionalStates, setAdditionalStates] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStepVisible, setIsStepVisible] = useState(false);

  // Verify the user is actually signed in and recover any org they already
  // created in a prior, interrupted onboarding attempt so step 2 updates that
  // row instead of trying to create a second one.
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const metadataOrgId = (user.user_metadata as { organization_id?: string } | null)
        ?.organization_id;
      if (metadataOrgId) {
        setOrganizationId(metadataOrgId);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.organization_id) {
        setOrganizationId(profile.organization_id as string);
      }
    })();
  }, [supabase, router]);

  useEffect(() => {
    setIsStepVisible(false);
    const frame = requestAnimationFrame(() => setIsStepVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [currentStep]);

  const handleAccountTypeSelect = (type: AccountType) => {
    setAccountType(type);
    setCurrentStep(2);
    void saveOnboardingDraft({ account_type: type, step: 2 });
  };

  const handleCompanyDetailsContinue = async (data: CompanyDetailsData) => {
    try {
      setIsSubmitting(true);
      if (DEV_ONBOARDING_BYPASS) {
        setOrganizationId("dev-bypass-org");
        setCompanyState(data.state);
        setIsMultiState(data.isMultiState);
        setAdditionalStates(data.additionalStates);
        setCurrentStep(3);
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error(userError?.message ?? "Your session has expired. Please log in again.");
      }

      const orgPayload = {
        name: data.companyName,
        account_type: accountType,
        portal_slug: data.portalSlug,
        support_email: data.supportEmail,
        support_phone: data.supportPhone,
        city: data.city.trim() || null,
        state: data.state.trim() || null,
        zip: data.zip.trim() || null,
        management_software: data.managementSoftware?.trim() || null,
        management_software_other:
          data.managementSoftware === "other"
            ? data.managementSoftwareOther?.trim() || null
            : null,
      };

      let organization_id: string;
      if (organizationId) {
        // Recovery path — user already has an org from a prior interrupted attempt.
        const { error: updateError } = await supabase
          .from("organizations")
          .update(orgPayload)
          .eq("id", organizationId);
        if (updateError) {
          throw new Error(updateError.message);
        }
        organization_id = organizationId;
      } else {
        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .insert(orgPayload)
          .select("id")
          .single();
        if (orgError || !org) {
          throw new Error(orgError?.message ?? "Failed creating organization.");
        }
        organization_id = org.id as string;
        setOrganizationId(organization_id);
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: { organization_id },
      });
      if (metadataError) throw metadataError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ organization_id, role: "owner" })
        .eq("id", user.id);
      if (profileError) throw profileError;

      setCompanyState(data.state);
      setIsMultiState(data.isMultiState);
      setAdditionalStates(data.additionalStates);
      setCurrentStep(3);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save company details.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeesContinue = async (data: FeesData) => {
    if (!organizationId && !DEV_ONBOARDING_BYPASS) {
      toast.error("Organization ID missing. Please complete company details first.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (DEV_ONBOARDING_BYPASS) {
        setCurrentStep(4);
        return;
      }

      const standardTurnaroundDays = Number.parseInt(data.turnaround, 10);
      const feesRows = [
        { master_type_key: "resale_certificate", base_fee: Number(data.resaleCertificate) || 0 },
        { master_type_key: "certificate_update", base_fee: Number(data.certificateUpdate) || 0 },
        { master_type_key: "lender_questionnaire", base_fee: Number(data.lenderQuestionnaire) || 0 },
        { master_type_key: "demand_letter", base_fee: Number(data.demandLetter) || 0 },
      ].map((row) => ({
        ...row,
        organization_id: organizationId,
        rush_same_day_fee: data.rushSameDay.enabled ? Number(data.rushSameDay.fee || 0) : null,
        rush_next_day_fee: data.rushNextDay.enabled ? Number(data.rushNextDay.fee || 0) : null,
        rush_3day_fee: data.rushThreeDay.enabled ? Number(data.rushThreeDay.fee || 0) : null,
        standard_turnaround_days: Number.isNaN(standardTurnaroundDays) ? 10 : standardTurnaroundDays,
      }));

      const { error } = await supabase.from("document_request_fees").insert(feesRows);
      if (error) throw error;

      setCurrentStep(4);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save fee settings.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    return response.blob();
  };

  const handlePortalSetupContinue = async (data: PortalSetupData) => {
    if (!organizationId && !DEV_ONBOARDING_BYPASS) {
      toast.error("Organization ID missing. Please complete company details first.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (DEV_ONBOARDING_BYPASS) {
        setCurrentStep(5);
        return;
      }

      let logoUrl: string | null = null;
      if (data.logoDataUrl) {
        // TODO (REQUIRED): Create a public Supabase Storage bucket named "logos"
        // in the Supabase dashboard before testing logo uploads.
        const blob = await dataUrlToBlob(data.logoDataUrl);
        const extension = blob.type.split("/")[1] ?? "png";
        const filePath = `${organizationId}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("logos")
          .upload(filePath, blob, { upsert: true, contentType: blob.type });
        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage.from("logos").getPublicUrl(filePath);
        logoUrl = publicData.publicUrl;
      }

      const updatePayload: {
        brand_color: string;
        portal_tagline: string;
        logo_url?: string | null;
      } = {
        brand_color: data.brandColor,
        portal_tagline: data.welcomeMessage,
      };

      if (logoUrl) updatePayload.logo_url = logoUrl;

      const { error } = await supabase
        .from("organizations")
        .update(updatePayload)
        .eq("id", organizationId);
      if (error) throw error;

      setCurrentStep(5);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save portal branding.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvitesFinish = async (emails: string[]) => {
    if (!organizationId && !DEV_ONBOARDING_BYPASS) {
      toast.error("Organization ID missing. Please complete company details first.");
      return;
    }

    try {
      setIsSubmitting(true);
      if (DEV_ONBOARDING_BYPASS) {
        router.push("/onboarding/complete");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error(userError?.message ?? "Your session has expired. Please log in again.");
      }

      if (emails.length > 0) {
        const rows = emails.map((email) => ({
          organization_id: organizationId,
          email,
          role: "admin",
          invited_by: user.id,
        }));
        const { error } = await supabase.from("invitations").insert(rows);
        if (error) throw error;
      }

      void saveOnboardingDraft({
        invite_emails: emails,
        completed_at: new Date().toISOString(),
        step: 5,
      });

      router.push("/onboarding/complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String((error as { message: string }).message) : "Failed to send invitations.";
      toast.error(message);
      console.error("[onboarding] invitation error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOnboardingComplete = () => {
    router.push("/onboarding/complete");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <div className="hidden w-80 shrink-0 md:block">
        <OnboardingSidebar
          currentStep={currentStep}
          totalSteps={5}
          accountType={accountType}
          onStepClick={setCurrentStep}
        />
      </div>
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        {currentStep > 1 && (
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="absolute top-8 left-8 z-10 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
        <div
          key={currentStep}
          className={`flex flex-1 flex-col transition-all duration-200 ease-out ${
            isStepVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {currentStep === 1 && <StepAccountType onSelect={handleAccountTypeSelect} />}
          {currentStep === 2 && (
            <StepCompanyDetails
              accountType={accountType}
              onContinue={handleCompanyDetailsContinue}
              isSubmitting={isSubmitting}
            />
          )}
          {currentStep === 3 && (
            <StepFees
              primaryState={companyState}
              isMultiState={isMultiState}
              additionalStates={additionalStates}
              onContinue={handleFeesContinue}
              isSubmitting={isSubmitting}
            />
          )}
          {currentStep === 4 && (
            <StepPortalSetup
              onContinue={handlePortalSetupContinue}
              onSkip={() => setCurrentStep(5)}
              isSubmitting={isSubmitting}
            />
          )}
          {currentStep === 5 && (
            <StepInviteAdmins
              accountType={accountType}
              onFinish={handleInvitesFinish}
              onSkip={() => handleOnboardingComplete()}
              isSubmitting={isSubmitting}
            />
          )}
        </div>

        <div className="bg-havn-navy px-8 py-8 md:hidden">
          <ValuePropsList
            variant="dark"
            audience={accountType === "self_managed" ? "associations" : "teams"}
          />
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
