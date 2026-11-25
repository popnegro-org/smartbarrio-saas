import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "@/lib/supabase/rest";

type MetaMessage = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
};
type MetaPayload = { entry?: Array<{ messaging?: MetaMessage[] }> };
type Integration = { tenant_id: string; status: string; external_account_id: string | null };

export const runtime = "nodejs";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = request.nextUrl.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  if (mode === "subscribe" && expected && safeEqual(token, expected) && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!appSecret || !signature.startsWith("sha256=")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const raw = await request.text();
  const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  if (!safeEqual(signature, expected)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  try {
    const payload = JSON.parse(raw) as MetaPayload;
    const base = process.env.N8N_WEBHOOK_BASE_URL;
    const automationSecret = process.env.AUTOMATION_SECRET;
    if (!base || !automationSecret) return NextResponse.json({ received: true, automation: "not_configured" });

    for (const entry of payload.entry ?? []) {
      for (const item of entry.messaging ?? []) {
        const sender = item.sender?.id;
        const recipient = item.recipient?.id;
        const message = item.message?.text;
        const providerMessageId = item.message?.mid;
        if (!sender || !recipient || !message || !providerMessageId || item.message?.is_echo) continue;

        const integrations = await supabaseRequest<Integration[]>(
          "social_integrations?select=tenant_id,status,external_account_id&provider=eq.instagram&external_account_id=eq." +
          encodeURIComponent(recipient) + "&status=eq.connected&limit=1",
          { admin: true },
        );
        const integration = integrations[0];
        if (!integration) continue;

        await fetch(base.replace(/\/$/, "") + "/webhook/smartbarrio/inbound-message", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-automation-secret": automationSecret },
          body: JSON.stringify({
            tenantId: integration.tenant_id,
            channel: "instagram",
            sender,
            message: message.slice(0, 4000),
            providerMessageId,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Meta webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
