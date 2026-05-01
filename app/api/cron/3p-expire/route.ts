import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { send3pFormAutoDefaulted } from "@/lib/resend";

/**
 * Daily sweep that auto-defaults any 3P template that's been pending
 * review for more than 5 days. Flips status, updates the linked order,
 * and emails the requester that Havn's standard template will be used.
 */

const REVIEW_WINDOW_DAYS = 5;

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const admin = createAdminClient();
  const cutoffIso = new Date(Date.now() - REVIEW_WINDOW_DAYS * 86400000).toISOString();
  console.log(`[cron/3p-expire] starting sweep for rows created before ${cutoffIso}`);

  const { data: rows, error } = await admin
    .from("third_party_templates")
    .select(
      `id, order_id, organization_id, form_title, created_at,
       order:order_id (requester_email, requester_name, property_address, master_type_key),
       organization:organization_id (name)`
    )
    .eq("review_status", "pending")
    .lt("created_at", cutoffIso);

  if (error) {
    console.error(`[cron/3p-expire] select failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let expired = 0;
  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  for (const row of rows ?? []) {
    const id = row.id as string;
    const orderId = row.order_id as string;
    const orderObj = row.order as {
      requester_email?: string | null;
      requester_name?: string | null;
      property_address?: string | null;
      master_type_key?: string | null;
    } | null;
    const orgObj = row.organization as { name?: string | null } | null;

    // Flip status on the template + linked order.
    const { error: updErr } = await admin
      .from("third_party_templates")
      .update({
        review_status: "auto_defaulted",
        auto_defaulted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id);
    if (updErr) {
      errors.push(`template ${id}: ${updErr.message}`);
      continue;
    }

    await admin
      .from("document_orders")
      .update({ third_party_review_status: "auto_defaulted" })
      .eq("id", orderId);

    // Notify requester.
    const to = orderObj?.requester_email?.trim();
    if (to) {
      try {
        await send3pFormAutoDefaulted({
          to,
          requesterName: orderObj?.requester_name ?? "there",
          propertyAddress: orderObj?.property_address ?? "the subject property",
          orgName: orgObj?.name ?? "your association's management company",
          docType: formatMasterTypeKey(orderObj?.master_type_key ?? null),
          formTitle: (row.form_title as string | null) ?? null,
        });
      } catch (emailErr) {
        errors.push(
          `email ${id}: ${emailErr instanceof Error ? emailErr.message : "send failed"}`
        );
      }
    }

    expired += 1;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[cron/3p-expire] done — expired=${expired}, errors=${errors.length}, elapsed=${elapsedMs}ms`
  );
  if (errors.length > 0) {
    console.error(`[cron/3p-expire] errors: ${errors.join("; ")}`);
  }

  return NextResponse.json({ expired, errors, elapsedMs });
}

function formatMasterTypeKey(raw: string | null): string {
  if (!raw) return "document";
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
