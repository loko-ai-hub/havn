import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatCurrency, formatDeliverySpeed, formatMasterTypeKey, formatOrderDate } from "./_lib/format";
import { requireDashboardOrg } from "./_lib/require-dashboard-org";
import { OrderStatusBadge } from "./_lib/status-badge";

type OrderRow = {
  id: string;
  created_at: string | null;
  requester_name: string | null;
  requester_email: string | null;
  property_address: string | null;
  master_type_key: string | null;
  delivery_speed: string | null;
  total_fee: number | null;
  order_status: string | null;
};

export default async function DashboardOrdersPage() {
  const { organizationId } = await requireDashboardOrg();
  const admin = createAdminClient();

  const { data: orders, error } = await admin
    .from("document_orders")
    .select(
      "id, created_at, requester_name, requester_email, property_address, master_type_key, delivery_speed, total_fee, order_status"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  const rows = (orders ?? []) as OrderRow[];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Incoming document requests for your organization.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No orders yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            When requesters submit orders through your portal, they will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Requester</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Property</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Document</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Delivery</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const href = `/dashboard/orders/${order.id}`;
                return (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 align-top">
                      <Link href={href} className="text-foreground hover:underline">
                        {formatOrderDate(order.created_at)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={href} className="block hover:underline">
                        <span className="font-medium text-foreground">
                          {order.requester_name || "—"}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {order.requester_email || "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <Link href={href} className="block hover:underline">
                        {order.property_address || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={href} className="text-foreground hover:underline">
                        {formatMasterTypeKey(order.master_type_key)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <Link href={href} className="block hover:underline">
                        {formatDeliverySpeed(order.delivery_speed)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-foreground">
                      <Link href={href} className="block hover:underline">
                        {formatCurrency(order.total_fee)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={href} className="inline-block hover:opacity-90">
                        <OrderStatusBadge status={order.order_status} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
