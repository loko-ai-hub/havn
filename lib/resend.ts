import { Resend } from "resend";

export const RESEND_FROM_EMAIL = "orders@havnhq.com";

let resendClient: Resend | undefined;

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

/** Lazily constructs the SDK so importing this module does not throw when the API key is unset (e.g. CI/build). */
const resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    return Reflect.get(getResend(), prop, receiver);
  },
});

export async function sendManagementNotification({
  orgName,
  orgEmail,
  orderId,
  requesterName,
  requesterEmail,
  requesterRole,
  propertyAddress,
  documentType,
  deliverySpeed,
  totalFee,
  portalSlug,
}: {
  orgName: string;
  orgEmail: string;
  orderId: string;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  propertyAddress: string;
  documentType: string;
  deliverySpeed: string;
  totalFee: number;
  portalSlug: string;
}) {
  void orgName;
  void portalSlug;

  const shortId = orderId.slice(0, 8);
  const totalPaid = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(totalFee) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(totalFee);
  const dashboardUrl = `https://havnhq.com/dashboard/requests/${orderId}`;

  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to: orgEmail,
    subject: `New order received — ${documentType} for ${propertyAddress}`,
    html: `
          <p><strong>New Order Received</strong></p>
          <p>A new document request has been submitted through your Havn portal.</p>
          <p><strong>Order ID:</strong> ${shortId}</p>
          <p><strong>Document:</strong> ${documentType}</p>
          <p><strong>Property:</strong> ${propertyAddress}</p>
          <p><strong>Requester:</strong> ${requesterName} (${requesterRole})</p>
          <p><strong>Requester Email:</strong> ${requesterEmail}</p>
          <p><strong>Delivery:</strong> ${deliverySpeed}</p>
          <p><strong>Total Paid:</strong> ${totalPaid}</p>
          <p><a href="${dashboardUrl}">View Order</a></p>
          <p>Powered by Havn · havnhq.com</p>
        `,
  });
}

export default resend;
