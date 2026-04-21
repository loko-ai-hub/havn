"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { stopImpersonation } from "../god-mode/actions";

export default function ImpersonationBanner({ orgName }: { orgName: string | null }) {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-havn-amber px-4 py-2 text-sm font-semibold text-black shadow-md">
      <span>
        Impersonating: <span className="font-bold">{orgName ?? "Unknown org"}</span>
      </span>
      <button
        type="button"
        disabled={stopping}
        onClick={() => {
          setStopping(true);
          void (async () => {
            await stopImpersonation();
            router.push("/god-mode");
            router.refresh();
          })();
        }}
        className="rounded-md bg-black/20 px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-black/30 disabled:opacity-50"
      >
        {stopping ? "Stopping…" : "Stop Impersonating"}
      </button>
    </div>
  );
}
