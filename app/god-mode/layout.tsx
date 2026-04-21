import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAILS = ["loren@havnhq.com"];

export default async function GodModeLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !ALLOWED_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    redirect("/login");
  }

  return <>{children}</>;
}
