import { Resend } from "resend";

export const RESEND_FROM_EMAIL = "orders@havnhq.com";
export const HAVN_CONCIERGE_INBOX = "loren@havnhq.com";

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
    subject: `New order received: ${documentType} for ${propertyAddress}`,
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

const appBaseUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://havnhq.com";

export async function sendStripeConnectNudgeEmail({
  to,
  orgName,
}: {
  to: string;
  orgName: string;
}) {
  const settingsUrl = `${appBaseUrl()}/dashboard/settings`;

  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: "Complete your Havn setup to start receiving payouts",
    html: `
          <p>Hi ${orgName},</p>
          <p>Your Havn portal is live and ready to accept orders, but you haven&apos;t connected your bank account yet.</p>
          <p>Until you connect, any payments collected are held and cannot be released to you.</p>
          <p><a href="${settingsUrl}">Connect your bank account →</a></p>
          <p>Takes less than 5 minutes. Secured by Stripe.</p>
          <p>— The Havn Team</p>
        `,
  });
}

/* ── 3P template workflow emails ─────────────────────────────────────── */

export async function send3pFormApproved({
  to,
  requesterName,
  propertyAddress,
  orgName,
  formTitle,
}: {
  to: string;
  requesterName: string;
  propertyAddress: string;
  orgName: string;
  formTitle: string | null;
}) {
  const subject = "Your form has been approved";
  const formLabel = formTitle ? `"${formTitle}"` : "your form";
  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html: `
      <p>Hi ${requesterName},</p>
      <p>Good news. Havn has reviewed ${formLabel} for the order at <strong>${propertyAddress}</strong>, and approved its use.</p>
      <p>${orgName} will complete the form and deliver it along with your order. You&apos;ll receive a separate notification when the documents are ready to download.</p>
      <p>Thank you for using Havn.</p>
      <p>— The Havn Team</p>
    `,
  });
}

export async function send3pFormDenied({
  to,
  requesterName,
  propertyAddress,
  reason,
  orgName,
  docType,
  formTitle,
}: {
  to: string;
  requesterName: string;
  propertyAddress: string;
  reason: string;
  orgName: string;
  docType: string;
  formTitle: string | null;
}) {
  const subject = "Your form could not be used. Defaulting to the Havn standard";
  const formLabel = formTitle ? `"${formTitle}"` : "the form you supplied";
  const reasonBlock = reason.trim()
    ? `<p><strong>Reason:</strong> ${reason}</p>`
    : "";
  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html: `
      <p>Hi ${requesterName},</p>
      <p>Havn has reviewed ${formLabel} attached to your order for <strong>${propertyAddress}</strong> and is unable to use it for this transaction.</p>
      ${reasonBlock}
      <p>To keep your order moving, ${orgName} will deliver the standard <strong>${docType}</strong> prepared by Havn. You&apos;ll receive your documents on the original delivery timeline.</p>
      <p>If you have any questions, reply to this email.</p>
      <p>— The Havn Team</p>
    `,
  });
}

export async function send3pFormAutoDefaulted({
  to,
  requesterName,
  propertyAddress,
  orgName,
  docType,
  formTitle,
}: {
  to: string;
  requesterName: string;
  propertyAddress: string;
  orgName: string;
  docType: string;
  formTitle: string | null;
}) {
  const subject = "Your form was not reviewed in time. Defaulting to the Havn standard";
  const formLabel = formTitle ? `"${formTitle}"` : "your uploaded form";
  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    html: `
      <p>Hi ${requesterName},</p>
      <p>${formLabel} for your order at <strong>${propertyAddress}</strong> wasn&apos;t reviewed within our 5-day review window.</p>
      <p>To keep your order on schedule, ${orgName} will deliver the standard <strong>${docType}</strong> prepared by Havn. No action is needed from you. You&apos;ll receive your documents on the original timeline.</p>
      <p>If you believe this was an error or have a revised form, reply to this email and we&apos;ll take another look.</p>
      <p>— The Havn Team</p>
    `,
  });
}

/* ── Concierge portfolio import ──────────────────────────────────────── */

export async function sendConciergeImportRequest({
  customerEmail,
  customerName,
  orgName,
  orgId,
  notes,
  attachments,
}: {
  customerEmail: string;
  customerName: string;
  orgName: string;
  orgId: string;
  notes: string;
  attachments: { filename: string; content: string }[]; // base64 content
}) {
  const noteBlock = notes.trim()
    ? `<p><strong>Notes from customer:</strong></p><p>${notes
        .trim()
        .replace(/\n/g, "<br/>")}</p>`
    : "<p><em>No additional notes.</em></p>";

  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to: HAVN_CONCIERGE_INBOX,
    replyTo: customerEmail,
    subject: `Concierge import request — ${orgName}`,
    html: `
      <p><strong>New concierge import request.</strong></p>
      <p><strong>Org:</strong> ${orgName} (${orgId})</p>
      <p><strong>Customer:</strong> ${customerName} &lt;${customerEmail}&gt;</p>
      ${noteBlock}
      <p><strong>Attachments:</strong> ${attachments.length}</p>
      <hr/>
      <p>Reply to this email to reach the customer directly. Once their portfolio is loaded, send them the confirmation email so they know they&apos;re live.</p>
    `,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
}

export async function sendConciergeConfirmation({
  customerEmail,
  customerName,
  orgName,
}: {
  customerEmail: string;
  customerName: string;
  orgName: string;
}) {
  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to: customerEmail,
    subject: "We've got your portfolio — Havn",
    html: `
      <p>Hi ${customerName || "there"},</p>
      <p>Thanks for sending us your portfolio. A Havn specialist will load it into your <strong>${orgName}</strong> account within 24 hours.</p>
      <p>If we have any questions while we&apos;re working on it, we&apos;ll reply to this email. You&apos;ll get another email from us when your communities are live in your dashboard.</p>
      <p>— The Havn Team</p>
    `,
  });
}

/* ── 3P form review (existing) ──────────────────────────────────────── */

export async function send3pReviewNeeded({
  to,
  orderShortId,
  uploaderEmail,
  docType,
  coveragePct,
}: {
  to: string;
  orderShortId: string;
  uploaderEmail: string;
  docType: string;
  coveragePct: number;
}) {
  const godModeUrl = `${appBaseUrl()}/god-mode`;
  await getResend().emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject: `3P form awaiting review — Order #${orderShortId}`,
    html: `
      <p>A requester has uploaded a third-party form that needs review.</p>
      <p><strong>Order:</strong> #${orderShortId}</p>
      <p><strong>Uploader:</strong> ${uploaderEmail}</p>
      <p><strong>Document type:</strong> ${docType}</p>
      <p><strong>Auto-fill coverage:</strong> ${coveragePct.toFixed(1)}%</p>
      <p><a href="${godModeUrl}">Review in God Mode →</a></p>
      <p>If not reviewed within 5 days, the order will auto-default to the standard Havn template.</p>
    `,
  });
}

export default resend;
