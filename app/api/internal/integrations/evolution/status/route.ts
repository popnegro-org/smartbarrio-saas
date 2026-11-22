import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { supabaseRequest } from "@/lib/supabase/rest";

type Offer = { id: string; tenant_id: string; title: string; description: string | null; channels: Record<string, boolean> };
type Instance = { instance_name: string; connection_status: string };
type IntegrationEvent = { id: string; status: string; attempts: number };

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let claimedEventId: string | null = null;

  try {
    const body = (await request.json()) as { tenantId?: unknown; offerId?: unknown; eventId?: unknown };
    if (typeof body.tenantId !== "string" || typeof body.offerId !== "string" || typeof body.eventId !== "string") {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const offers = await supabaseRequest<Offer[]>(
      "offers?select=id,tenant_id,title,description,channels&id=eq." + body.offerId + "&tenant_id=eq." + body.tenantId + "&limit=1",
      { admin: true },
    );
    const offer = offers[0];
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (offer.channels?.whatsapp !== true) return NextResponse.json({ skipped: true, reason: "channel_disabled" });

    const tenants = await supabaseRequest<{ slug: string; is_published: boolean }[]>(
      "tenants?select=slug,is_published&id=eq." + body.tenantId + "&limit=1",
      { admin: true },
    );
    if (!tenants[0]?.is_published) return NextResponse.json({ skipped: true, reason: "commerce_not_published" });

    const instances = await supabaseRequest<Instance[]>(
      "whatsapp_instances?select=instance_name,connection_status&tenant_id=eq." + body.tenantId + "&limit=1",
      { admin: true },
    );
    const instance = instances[0];
    if (!instance || instance.connection_status !== "connected") {
      return NextResponse.json({ skipped: true, reason: "whatsapp_not_connected" });
    }

    const baseUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl || !apiKey || !appUrl) {
      return NextResponse.json({ error: "Evolution integration is not configured" }, { status: 503 });
    }

    const idempotencyKey = "offer-whatsapp-status:" + body.eventId;
    let events = await supabaseRequest<IntegrationEvent[]>(
      "integration_events?select=id,status,attempts&tenant_id=eq." + body.tenantId +
      "&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1",
      { admin: true },
    );
    let event = events[0];

    if (event?.status === "succeeded") return NextResponse.json({ success: true, duplicate: true });
    if (event?.status === "processing") return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });

    if (event) {
      const updated = await supabaseRequest<IntegrationEvent[]>(
        "integration_events?id=eq." + event.id + "&select=id,status,attempts",
        { method: "PATCH", admin: true, prefer: "return=representation", body: { status: "processing", attempts: event.attempts + 1, last_error: null } },
      );
      event = updated[0] ?? event;
      claimedEventId = event.id;
    } else {
      const inserted = await supabaseRequest<IntegrationEvent[]>(
        "integration_events?select=id,status,attempts",
        {
          method: "POST",
          admin: true,
          prefer: "resolution=ignore-duplicates,return=representation",
          body: [{ tenant_id: body.tenantId, event_type: "offer.whatsapp_status", idempotency_key: idempotencyKey, status: "processing", attempts: 1, payload: { offerId: offer.id } }],
        },
      );
      event = inserted[0];
      claimedEventId = event?.id ?? null;
      if (!event) {
        events = await supabaseRequest<IntegrationEvent[]>(
          "integration_events?select=id,status,attempts&tenant_id=eq." + body.tenantId +
          "&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1",
          { admin: true },
        );
        if (events[0]?.status === "succeeded") return NextResponse.json({ success: true, duplicate: true });
        return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
      }
    }

    const message = [offer.title, offer.description ?? "", appUrl.replace(/\/$/, "") + "/" + tenants[0].slug].filter(Boolean).join("\n");
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/message/sendStatus/" + encodeURIComponent(instance.instance_name), {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        statusMessage: {
          type: "text",
          content: message,
          backgroundColor: "#008000",
          font: 1,
          allContacts: true,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    const resultText = await response.text();
    if (!response.ok) throw new Error("Evolution returned HTTP " + response.status + ": " + resultText.slice(0, 300));

    await supabaseRequest("integration_events?id=eq." + event.id, {
      method: "PATCH", admin: true, prefer: "return=minimal",
      body: { status: "succeeded", result: { provider: "evolution" }, processed_at: new Date().toISOString(), last_error: null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Evolution status dispatch failed", error);
    if (claimedEventId) {
      await supabaseRequest("integration_events?id=eq." + claimedEventId, {
        method: "PATCH", admin: true, prefer: "return=minimal",
        body: { status: "failed", last_error: "Evolution status dispatch failed", next_retry_at: new Date(Date.now() + 60000).toISOString() },
      }).catch(() => null);
    }
    return NextResponse.json({ error: "WhatsApp status dispatch failed" }, { status: 502 });
  }
}
