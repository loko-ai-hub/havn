import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";
import { GOD_MODE_EMAILS } from "./constants";

export default async function GodModeLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !GOD_MODE_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    redirect("/login");
  }

  return <>{children}</>;
}
