import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { supabaseRequest } from "@/lib/supabase/rest";
import { readWhatsAppCredential } from "@/lib/integrations/whatsapp-credentials";

type Instance = { id: string; instance_name: string; connection_status: string };
type EventRow = { id: string; status: string; attempts: number };

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let claimedEventId: string | null = null;
  try {
    const body = (await request.json()) as {
      tenantId?: unknown; channel?: unknown; sender?: unknown; reply?: unknown; idempotencyKey?: unknown;
    };
    if (body.channel !== "whatsapp") return NextResponse.json({ skipped: true, reason: "channel_mismatch" });
    if (typeof body.tenantId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tenantId) || typeof body.sender !== "string" ||
        typeof body.reply !== "string" || typeof body.idempotencyKey !== "string") {
      return NextResponse.json({ error: "Invalid reply payload" }, { status: 400 });
    }
    const sender = body.sender.replace(/\D/g, "");
    if (sender.length < 8 || sender.length > 16 || !body.reply.trim()) {
      return NextResponse.json({ error: "Invalid recipient or message" }, { status: 400 });
    }

    const instances = await supabaseRequest<Instance[]>(
      "whatsapp_instances?select=id,instance_name,connection_status&tenant_id=eq." + body.tenantId + "&limit=1",
      { admin: true },
    );
    const instance = instances[0];
    if (!instance || instance.connection_status !== "connected") {
      return NextResponse.json({ skipped: true, reason: "whatsapp_not_connected" });
    }

    const idempotencyKey = "inbound-reply:" + body.idempotencyKey;
    let events = await supabaseRequest<EventRow[]>(
      "integration_events?select=id,status,attempts&tenant_id=eq." + body.tenantId +
      "&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1",
      { admin: true },
    );
    let event = events[0];
    if (event?.status === "succeeded") return NextResponse.json({ success: true, duplicate: true });
    if (event?.status === "processing") return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });

    if (event) {
      const rows = await supabaseRequest<EventRow[]>(
        "integration_events?id=eq." + event.id + "&select=id,status,attempts",
        { method: "PATCH", admin: true, prefer: "return=representation", body: { status: "processing", attempts: event.attempts + 1, last_error: null } },
      );
      event = rows[0] ?? event;
      claimedEventId = event.id;
    } else {
      const rows = await supabaseRequest<EventRow[]>(
        "integration_events?select=id,status,attempts",
        {
          method: "POST", admin: true, prefer: "resolution=ignore-duplicates,return=representation",
          body: [{ tenant_id: body.tenantId, event_type: "message.auto_reply", idempotency_key: idempotencyKey, status: "processing", attempts: 1, payload: { sender } }],
        },
      );
      event = rows[0];
      claimedEventId = event?.id ?? null;
      if (!event) return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
    }

    const baseUrl = process.env.EVOLUTION_API_URL;
    if (!baseUrl) throw new Error("Evolution API is not configured");
    const instanceToken = await readWhatsAppCredential(instance.id);
    if (!instanceToken) throw new Error("Encrypted Evolution instance token is unavailable");

    const recipient = sender.split("@")[0].replace(/\D/g, "");
    if (recipient.length < 10) throw new Error("Invalid WhatsApp recipient");
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/message/sendText/" + encodeURIComponent(instance.instance_name), {
      method: "POST",
      headers: { apikey: instanceToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number: recipient, text: body.reply.slice(0, 4000) }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Evolution send failed with HTTP " + response.status);
    await supabaseRequest("integration_events?id=eq." + event.id, {
      method: "PATCH", admin: true, prefer: "return=minimal",
      body: { status: "succeeded", processed_at: new Date().toISOString(), result: { provider: "evolution" }, last_error: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("WhatsApp auto-reply failed", error);
    if (claimedEventId) {
      await supabaseRequest("integration_events?id=eq." + claimedEventId, {
        method: "PATCH", admin: true, prefer: "return=minimal",
        body: { status: "failed", last_error: "WhatsApp auto-reply failed", next_retry_at: new Date(Date.now() + 60000).toISOString() },
      }).catch(() => null);
    }
    return NextResponse.json({ error: "WhatsApp auto-reply failed" }, { status: 502 });
  }
}
