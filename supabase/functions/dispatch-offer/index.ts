const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Offer = { id: string; tenant_id: string; status: string };
type Tenant = { slug: string; is_published: boolean };
type EventRow = { id: string; status: string; attempts: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) throw new Error("Supabase Edge Function secrets are incomplete");
  const response = await fetch(base.replace(/\/$/, "") + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error("Supabase REST returned HTTP " + response.status);
  if (response.status === 204) return [] as T;
  return (await response.json()) as T;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("AUTOMATION_SECRET") ?? "";
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !safeEqual(supplied, expected)) return json({ error: "Unauthorized" }, 401);

  let eventId: string | null = null;
  let tenantId: string | null = null;
  try {
    const body = (await request.json()) as { tenantId?: unknown; offerId?: unknown; eventId?: unknown };
    if (typeof body.tenantId !== "string" || typeof body.offerId !== "string" ||
        typeof body.eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tenantId) ||
        !/^[0-9a-f-]{36}$/i.test(body.offerId) || !/^[0-9a-f-]{36}$/i.test(body.eventId)) {
      return json({ error: "Invalid offer event" }, 400);
    }
    tenantId = body.tenantId;
    eventId = body.eventId;

    const offers = await rest<Offer[]>(
      "offers?select=id,tenant_id,status&id=eq." + body.offerId + "&tenant_id=eq." + body.tenantId + "&limit=1",
    );
    if (!offers[0] || offers[0].status !== "published") return json({ error: "Published offer not found" }, 404);

    const tenants = await rest<Tenant[]>(
      "tenants?select=slug,is_published&id=eq." + body.tenantId + "&limit=1",
    );
    if (!tenants[0]?.is_published) return json({ error: "Published commerce not found" }, 404);

    const idempotencyKey = "edge-offer-dispatch:" + body.eventId;
    let events = await rest<EventRow[]>(
      "integration_events?select=id,status,attempts&tenant_id=eq." + body.tenantId +
      "&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1",
    );
    let event = events[0];
    if (event?.status === "succeeded") return json({ success: true, duplicate: true });
    if (event?.status === "processing") return json({ accepted: true, duplicate: true }, 202);

    if (event) {
      const rows = await rest<EventRow[]>(
        "integration_events?id=eq." + event.id + "&select=id,status,attempts",
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "processing", attempts: event.attempts + 1, last_error: null }) },
      );
      event = rows[0] ?? event;
    } else {
      const rows = await rest<EventRow[]>(
        "integration_events?on_conflict=tenant_id,idempotency_key&select=id,status,attempts",
        {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify([{
            tenant_id: body.tenantId,
            event_type: "offer.dispatch",
            idempotency_key: idempotencyKey,
            status: "processing",
            attempts: 1,
            payload: { offerId: body.offerId },
          }]),
        },
      );
      event = rows[0];
      if (!event) return json({ accepted: true, duplicate: true }, 202);
    }

    const webhookBase = Deno.env.get("N8N_WEBHOOK_BASE_URL");
    if (!webhookBase) throw new Error("N8N_WEBHOOK_BASE_URL is not configured");
    const webhook = await fetch(webhookBase.replace(/\/$/, "") + "/webhook/smartbarrio/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-automation-secret": expected },
      body: JSON.stringify({ tenantId: body.tenantId, offerId: body.offerId, eventId: body.eventId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!webhook.ok) throw new Error("n8n returned HTTP " + webhook.status);

    await rest("integration_events?id=eq." + event.id, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "succeeded", processed_at: new Date().toISOString(), result: { provider: "n8n" }, last_error: null }),
    });
    return json({ success: true, dispatched: true });
  } catch (error) {
    console.error("dispatch-offer failed", error);
    if (eventId && tenantId) {
      await rest("integration_events?tenant_id=eq." + tenantId + "&idempotency_key=eq." + encodeURIComponent("edge-offer-dispatch:" + eventId), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed", last_error: "Offer dispatch failed", next_retry_at: new Date(Date.now() + 60000).toISOString() }),
      }).catch(() => null);
    }
    return json({ error: "Offer dispatch failed" }, 502);
  }
});
