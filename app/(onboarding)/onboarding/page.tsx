"use client";

import { useMemo, useState } from "react";
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

  const handleAccountTypeSelect = (type: AccountType) => {
    setAccountType(type);
    setCurrentStep(2);
  };

  const handleCompanyDetailsContinue = async (data: CompanyDetailsData) => {
    try {
      setIsSubmitting(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error(userError?.message ?? "Unable to find current user.");
      }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: data.companyName,
          account_type: accountType,
          portal_slug: data.portalSlug,
          support_email: data.supportEmail,
          support_phone: data.supportPhone,
        })
        .select("id")
        .single();
      if (orgError || !org) {
        throw new Error(orgError?.message ?? "Failed creating organization.");
      }

      const organization_id = org.id as string;
      setOrganizationId(organization_id);

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
    if (!organizationId) {
      toast.error("Organization ID missing. Please complete company details first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const standardTurnaroundDays = Number.parseInt(data.turnaround, 10);
      const feesRows = [
        { document_type: "resale_certificate", base_fee: Number(data.resaleCertificate) || 0 },
        { document_type: "certificate_update", base_fee: Number(data.certificateUpdate) || 0 },
        { document_type: "lender_questionnaire", base_fee: Number(data.lenderQuestionnaire) || 0 },
        { document_type: "demand_letter", base_fee: Number(data.demandLetter) || 0 },
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
    if (!organizationId) {
      toast.error("Organization ID missing. Please complete company details first.");
      return;
    }

    try {
      setIsSubmitting(true);

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
    if (!organizationId) {
      toast.error("Organization ID missing. Please complete company details first.");
      return;
    }

    try {
      setIsSubmitting(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error(userError?.message ?? "Unable to find current user.");
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

      router.push("/onboarding/complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send invitations.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOnboardingComplete = () => {
    router.push("/onboarding/complete");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <div className="hidden w-1/3 shrink-0 md:block">
        <OnboardingSidebar
          currentStep={currentStep}
          totalSteps={5}
          accountType={accountType}
          onStepClick={setCurrentStep}
        />
      </div>
      <div className="relative flex-1 overflow-y-auto">
        {currentStep > 1 && (
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="absolute top-8 left-8 z-10 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
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
