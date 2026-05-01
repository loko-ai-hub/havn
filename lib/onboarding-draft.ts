// Lightweight helper for persisting in-progress onboarding data so we can see
// drop-offs with full field context (email, company name, state, incumbent software, etc.)
// rather than just an auth.users row with no signal.
//
// Called as the user types / clicks through steps, with a short debounce. Fire-and-forget:
// errors are logged and swallowed so a transient DB hiccup never blocks the onboarding UI.

import { createClient } from "@/lib/supabase/client";

export type OnboardingDraftFields = Partial<{
  step: number;
  account_type: string;
  company_name: string;
  portal_slug: string;
  support_email: string;
  support_phone: string;
  city: string;
  state: string;
  zip: string;
  management_software: string;
  management_software_other: string;
  is_multi_state: boolean;
  additional_states: string[];
  fees_draft: Record<string, unknown>;
  portal_draft: Record<string, unknown>;
  invite_emails: string[];
  completed_at: string;
}>;

export async function saveOnboardingDraft(fields: OnboardingDraftFields) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: user.id,
      ...fields,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("onboarding_drafts")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.warn("[onboarding-draft] upsert failed:", error.message);
    }
  } catch (err) {
    console.warn("[onboarding-draft] unexpected error:", err);
  }
}

type AnyFn = (...args: unknown[]) => unknown;
export function debounce<T extends AnyFn>(fn: T, waitMs: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}
