import type { ReactNode } from "react";
import Image from "next/image";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <Image
            src="/havn-lockup-light.svg"
            alt="Havn"
            width={96}
            height={32}
            priority
            className="h-8 w-auto"
          />
        </div>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-6 py-10">
        {children}
      </main>
    </div>
  );
}
