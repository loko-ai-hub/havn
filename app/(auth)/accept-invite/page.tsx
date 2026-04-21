import Link from "next/link";

import { getInviteDetails } from "./actions";
import AcceptInviteForm from "./accept-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl shadow-black/15">
        <h1 className="text-xl font-semibold">Invalid invite link</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This link is missing required information. Please use the full link from your invitation email.
        </p>
      </div>
    );
  }

  const result = await getInviteDetails(token);

  if ("error" in result) {
    return (
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl shadow-black/15">
        <h1 className="text-xl font-semibold">Invitation unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">{result.error}</p>
        <p className="mt-5 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      email={result.email}
      role={result.role}
      orgName={result.org_name}
    />
  );
}
