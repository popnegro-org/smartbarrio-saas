import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { readSocialCredentials } from "@/lib/integrations/social-credentials";
import { supabaseRequest } from "@/lib/supabase/rest";

type Integration = { id: string; status: string; external_account_id: string | null };
type EventRow = { id: string; status: string; attempts: number };

export const runtime = "nodejs";

async function updateEvent(id: string, values: Record<string, unknown>) {
  await supabaseRequest("integration_events?id=eq." + id, {
    method: "PATCH", admin: true, prefer: "return=minimal", body: values,
  });
}

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let claimedEventId: string | null = null;
  try {
    const body = (await request.json()) as {
      tenantId?: unknown; channel?: unknown; sender?: unknown; reply?: unknown; idempotencyKey?: unknown;
    };
    if (body.channel !== "instagram") return NextResponse.json({ skipped: true, reason: "channel_mismatch" });
    if (typeof body.tenantId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tenantId) ||
        typeof body.sender !== "string" || typeof body.reply !== "string" ||
        typeof body.idempotencyKey !== "string" || !body.reply.trim()) {
      return NextResponse.json({ error: "Invalid reply payload" }, { status: 400 });
    }

    const integrations = await supabaseRequest<Integration[]>(
      "social_integrations?select=id,status,external_account_id&tenant_id=eq." + body.tenantId +
      "&provider=eq.instagram&limit=1",
      { admin: true },
    );
    const integration = integrations[0];
    if (!integration || integration.status !== "connected" || !integration.external_account_id) {
      return NextResponse.json({ skipped: true, reason: "instagram_not_connected" });
    }

    const idempotencyKey = "inbound-reply:instagram:" + body.idempotencyKey;
    let events = await supabaseRequest<EventRow[]>(
      "integration_events?select=id,status,attempts&tenant_id=eq." + body.tenantId +
      "&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1",
      { admin: true },
    );
    let event = events[0];
    if (event?.status === "succeeded") return NextResponse.json({ success: true, duplicate: true });
    if (event?.status === "processing") return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
    if (event) {
      const updated = await supabaseRequest<EventRow[]>(
        "integration_events?id=eq." + event.id + "&select=id,status,attempts",
        { method: "PATCH", admin: true, prefer: "return=representation", body: { status: "processing", attempts: event.attempts + 1, last_error: null } },
      );
      event = updated[0] ?? event;
    } else {
      const inserted = await supabaseRequest<EventRow[]>(
        "integration_events?select=id,status,attempts",
        { method: "POST", admin: true, prefer: "resolution=ignore-duplicates,return=representation",
          body: [{ tenant_id: body.tenantId, event_type: "instagram.auto_reply", idempotency_key: idempotencyKey, status: "processing", attempts: 1, payload: { sender: body.sender } }] },
      );
      event = inserted[0];
      if (!event) return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
    }
    claimedEventId = event.id;

    const credentials = await readSocialCredentials(integration.id);
    if (!credentials) {
      await updateEvent(event.id, { status: "failed", last_error: "Meta credentials unavailable" });
      return NextResponse.json({ mode: "manual", reason: "meta_credentials_unavailable", reply: body.reply }, { status: 202 });
    }

    const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
    const url = new URL("https://graph.facebook.com/" + version + "/" + integration.external_account_id + "/messages");
    url.searchParams.set("access_token", credentials.accessToken);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: body.sender }, message: { text: body.reply.slice(0, 1000) } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Meta Messaging returned HTTP " + response.status + ": " + detail.slice(0, 300));
    }

    await updateEvent(event.id, { status: "succeeded", processed_at: new Date().toISOString(), result: { provider: "instagram_messaging" }, last_error: null });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Instagram reply failed", error);
    if (claimedEventId) await updateEvent(claimedEventId, {
      status: "failed", last_error: "Instagram reply failed",
      next_retry_at: new Date(Date.now() + 60000).toISOString(),
    }).catch(() => null);
    return NextResponse.json({ error: "Instagram reply failed" }, { status: 502 });
  }
}
