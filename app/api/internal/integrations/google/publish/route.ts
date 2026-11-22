import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { readSocialCredentials, storeSocialCredentials } from "@/lib/integrations/social-credentials";
import { supabaseRequest } from "@/lib/supabase/rest";

type Offer = { id: string; tenant_id: string; title: string; description: string | null; channels: Record<string, boolean> };
type Tenant = { slug: string; is_published: boolean };
type Integration = { id: string; status: string; external_account_id: string | null; token_expires_at: string | null };
type EventRow = { id: string; status: string; attempts: number };
type RefreshResponse = { access_token: string; expires_in: number; refresh_token?: string };

export const runtime = "nodejs";

async function updateEvent(id: string, values: Record<string, unknown>) {
  await supabaseRequest("integration_events?id=eq." + id, {
    method: "PATCH", admin: true, prefer: "return=minimal", body: values,
  });
}

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let claimedEventId: string | null = null;
  let fallbackText = "";
  let fallbackUrl = "";
  try {
    const body = (await request.json()) as { tenantId?: unknown; offerId?: unknown; eventId?: unknown };
    if (typeof body.tenantId !== "string" || typeof body.offerId !== "string" ||
        typeof body.eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tenantId) ||
        !/^[0-9a-f-]{36}$/i.test(body.offerId)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const offers = await supabaseRequest<Offer[]>(
      "offers?select=id,tenant_id,title,description,channels&id=eq." + body.offerId + "&tenant_id=eq." + body.tenantId + "&limit=1",
      { admin: true },
    );
    const offer = offers[0];
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (offer.channels?.google !== true) return NextResponse.json({ skipped: true, reason: "channel_disabled" });

    const tenants = await supabaseRequest<Tenant[]>(
      "tenants?select=slug,is_published&id=eq." + offer.tenant_id + "&limit=1",
      { admin: true },
    );
    const tenant = tenants[0];
    if (!tenant?.is_published) return NextResponse.json({ error: "Commerce not published" }, { status: 404 });

    const landingUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") + "/" + tenant.slug;
    const text = [offer.title, offer.description ?? "", landingUrl].filter(Boolean).join("\n");
    const integrations = await supabaseRequest<Integration[]>(
      "social_integrations?select=id,status,external_account_id,token_expires_at&tenant_id=eq." + offer.tenant_id + "&provider=eq.google_business&limit=1",
      { admin: true },
    );
    const integration = integrations[0];
    if (!integration || integration.status !== "connected" || !integration.external_account_id) {
      return NextResponse.json({ mode: "manual", reason: "google_business_not_connected", text, landingUrl });
    }

    const idempotencyKey = "offer-google-post:" + body.eventId;
    let events = await supabaseRequest<EventRow[]>(
      "integration_events?select=id,status,attempts&tenant_id=eq." + offer.tenant_id +
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
          body: [{ tenant_id: offer.tenant_id, event_type: "offer.google_post", idempotency_key: idempotencyKey, status: "processing", attempts: 1, payload: { offerId: offer.id } }] },
      );
      event = inserted[0];
      if (!event) {
        events = await supabaseRequest<EventRow[]>(
          "integration_events?select=id,status,attempts&tenant_id=eq." + offer.tenant_id +
          "&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1",
          { admin: true },
        );
        if (events[0]?.status === "succeeded") return NextResponse.json({ success: true, duplicate: true });
        return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 });
      }
    }
    claimedEventId = event.id;

    const credentials = await readSocialCredentials(integration.id);
    if (!credentials) {
      await updateEvent(event.id, { status: "failed", last_error: "OAuth credentials unavailable" });
      return NextResponse.json({ mode: "manual", reason: "google_credentials_unavailable", text, landingUrl });
    }

    let accessToken = credentials.accessToken;
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : 0;
    if (expiresAt < Date.now() + 60000) {
      if (!credentials.refreshToken) {
        await updateEvent(event.id, { status: "failed", last_error: "Google refresh token unavailable" });
        return NextResponse.json({ mode: "manual", reason: "google_reauthorization_required", text, landingUrl });
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw new Error("Google OAuth client is not configured");
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: credentials.refreshToken, grant_type: "refresh_token" }),
        cache: "no-store",
      });
      if (!refreshResponse.ok) throw new Error("Google access token refresh failed");
      const refreshed = (await refreshResponse.json()) as RefreshResponse;
      accessToken = refreshed.access_token;
      await storeSocialCredentials(integration.id, accessToken, credentials.refreshToken);
      await supabaseRequest("social_integrations?id=eq." + integration.id, {
        method: "PATCH", admin: true, prefer: "return=minimal",
        body: { token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), last_error: null },
      });
    }

    const publishResponse = await fetch(
      "https://mybusiness.googleapis.com/v4/" + integration.external_account_id + "/localPosts",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          languageCode: "es-AR",
          summary: text.slice(0, 1500),
          callToAction: { actionType: "LEARN_MORE", url: landingUrl },
          topicType: "STANDARD",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!publishResponse.ok) {
      const detail = await publishResponse.text();
      throw new Error("Google Business returned HTTP " + publishResponse.status + ": " + detail.slice(0, 300));
    }

    await updateEvent(event.id, { status: "succeeded", processed_at: new Date().toISOString(), result: { provider: "google_business" }, last_error: null });
    await supabaseRequest("social_integrations?id=eq." + integration.id, {
      method: "PATCH", admin: true, prefer: "return=minimal", body: { last_synced_at: new Date().toISOString() },
    });
    return NextResponse.json({ success: true, mode: "published" });
  } catch (error) {
    console.error("Google Business dispatch failed", error);
    if (claimedEventId) await updateEvent(claimedEventId, {
      status: "failed", last_error: "Google Business publication failed",
      next_retry_at: new Date(Date.now() + 60000).toISOString(),
    }).catch(() => null);
    return NextResponse.json({
      mode: "manual",
      reason: "google_api_unavailable",
      text: fallbackText,
      landingUrl: fallbackUrl,
      message: "La publicación automática no está disponible. Copiá el texto y publicalo desde Google Business Profile.",
    });
  }
}
