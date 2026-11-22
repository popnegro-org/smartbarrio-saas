import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "@/lib/supabase/rest";

type Instance = { tenant_id: string; instance_name: string };
type EvolutionWebhook = {
  event?: string;
  instance?: string;
  data?: {
    state?: string;
    status?: string;
    ownerJid?: string;
    jid?: string;
    key?: { id?: string; remoteJid?: string; fromMe?: boolean };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string };
      videoMessage?: { caption?: string };
    };
  };
};

export const runtime = "nodejs";

function validSecret(actual: string, expected: string | undefined) {
  if (!expected || !actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> },
) {
  const { secret } = await context.params;
  const headerSecret = request.headers.get("x-evolution-webhook-secret") ?? "";
  if (!validSecret(secret, process.env.EVOLUTION_WEBHOOK_SECRET) ||
      !validSecret(headerSecret, process.env.EVOLUTION_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as EvolutionWebhook;
    const instanceName = payload.instance;
    const event = (payload.event ?? "").toUpperCase();
    if (!instanceName || !event) return NextResponse.json({ received: true, ignored: true });

    const instances = await supabaseRequest<Instance[]>(
      "whatsapp_instances?select=tenant_id,instance_name&instance_name=eq." + encodeURIComponent(instanceName) + "&limit=1",
      { admin: true },
    );
    const instance = instances[0];
    if (!instance) return NextResponse.json({ received: true, ignored: true });

    if (event === "CONNECTION.UPDATE" || event === "CONNECTION_UPDATE") {
      const state = (payload.data?.state ?? payload.data?.status ?? "").toLowerCase();
      const status = state === "open" || state === "connected"
        ? "connected"
        : state === "connecting"
          ? "connecting"
          : state === "close" || state === "closed" || state === "disconnected"
            ? "disconnected"
            : "error";
      const phone = payload.data?.ownerJid ?? payload.data?.jid ?? null;
      await supabaseRequest("whatsapp_instances?instance_name=eq." + encodeURIComponent(instanceName), {
        method: "PATCH", admin: true, prefer: "return=minimal",
        body: {
          connection_status: status,
          phone_number: phone ? phone.split("@")[0].replace(/\D/g, "") : null,
          last_connected_at: status === "connected" ? new Date().toISOString() : undefined,
          last_error: status === "error" ? "Evolution connection state: " + state : null,
        },
      });
    }

    if (event === "QRCODE_UPDATED") {
      await supabaseRequest("whatsapp_instances?instance_name=eq." + encodeURIComponent(instanceName), {
        method: "PATCH", admin: true, prefer: "return=minimal",
        body: { connection_status: "qr_pending", qr_expires_at: new Date(Date.now() + 120000).toISOString() },
      });
    }

    if (event === "MESSAGES_UPSERT" || event === "MESSAGES.UPSERT") {
      const data = payload.data;
      const remoteJid = data?.key?.remoteJid ?? "";
      const fromMe = data?.key?.fromMe === true;
      const message = data?.message?.conversation ??
        data?.message?.extendedTextMessage?.text ??
        data?.message?.imageMessage?.caption ??
        data?.message?.videoMessage?.caption ?? "";
      const providerMessageId = data?.key?.id ?? "";

      if (!fromMe && remoteJid.includes("@s.whatsapp.net") && !remoteJid.includes("@g.us") && message && providerMessageId) {
        const base = process.env.N8N_WEBHOOK_BASE_URL;
        const automationSecret = process.env.AUTOMATION_SECRET;
        if (base && automationSecret) {
          await fetch(base.replace(/\/$/, "") + "/webhook/smartbarrio/inbound-message", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-automation-secret": automationSecret },
            body: JSON.stringify({
              tenantId: instance.tenant_id,
              channel: "whatsapp",
              sender: remoteJid.split("@")[0],
              message: String(message).slice(0, 4000),
              providerMessageId,
              instanceName,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Evolution webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
