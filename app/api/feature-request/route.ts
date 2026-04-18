import { NextRequest, NextResponse } from "next/server";
import { RESEND_FROM_EMAIL } from "@/lib/resend";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const { description, userName, userEmail } = await req.json() as {
      description: string;
      userName: string;
      userEmail: string;
    };

    if (!description?.trim()) {
      return NextResponse.json({ error: "Description is required." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: "loren@havnhq.com",
        subject: `Feature Request from ${userName}`,
        html: `
          <p><strong>Feature Request</strong></p>
          <p><strong>From:</strong> ${userName} (${userEmail})</p>
          <p><strong>Request:</strong></p>
          <p style="white-space: pre-wrap">${description.trim()}</p>
        `,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feature-request]", err);
    return NextResponse.json({ error: "Failed to submit." }, { status: 500 });
  }
}
