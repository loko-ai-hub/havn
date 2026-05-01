"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Fires a one-shot confetti burst when the dashboard is loaded with ?welcome=1
// (set as the return target from Stripe Connect onboarding). After firing, the
// param is stripped from the URL so a refresh won't re-trigger.

export default function CelebrationLauncher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (searchParams.get("welcome") !== "1") return;
    firedRef.current = true;

    void (async () => {
      try {
        const { default: confetti } = await import("canvas-confetti");

        // Layered burst — wider spread first, then two focused side blasts.
        confetti({
          particleCount: 160,
          spread: 90,
          startVelocity: 45,
          origin: { y: 0.35 },
          colors: ["#00c6e2", "#007fa8", "#f7fbfc", "#001526"],
          zIndex: 9999,
        });
        window.setTimeout(() => {
          confetti({
            particleCount: 80,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ["#00c6e2", "#007fa8"],
            zIndex: 9999,
          });
          confetti({
            particleCount: 80,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ["#00c6e2", "#007fa8"],
            zIndex: 9999,
          });
        }, 220);
      } catch (err) {
        console.warn("[celebration] confetti failed to load:", err);
      }
    })();

    // Strip ?welcome=1 so refresh / back doesn't re-fire. Preserve other params.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("welcome");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return null;
}
