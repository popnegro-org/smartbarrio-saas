import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { supabaseRequest } from "@/lib/supabase/rest";

type Offer = { id: string; tenant_id: string; title: string; description: string | null; channels: Record<string, boolean> };
type Tenant = { slug: string; is_published: boolean };
type Integration = { status: string; external_account_id: string | null };

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (offer.channels?.google !== true) return NextResponse.json({ skipped: true, reason: "channel_disabled" });

    const tenants = await supabaseRequest<Tenant[]>(
      "tenants?select=slug,is_published&id=eq." + offer.tenant_id + "&limit=1",
      { admin: true },
    );
    const tenant = tenants[0];
    if (!tenant?.is_published) return NextResponse.json({ error: "Commerce not published" }, { status: 404 });

    const integrations = await supabaseRequest<Integration[]>(
      "social_integrations?select=status,external_account_id&tenant_id=eq." + offer.tenant_id + "&provider=eq.google_business&limit=1",
      { admin: true },
    );
    const integration = integrations[0];
    const landingUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") + "/" + tenant.slug;
    const text = [offer.title, offer.description ?? "", landingUrl].filter(Boolean).join("\n");

    if (!integration || integration.status !== "connected" || !integration.external_account_id) {
      return NextResponse.json({
        mode: "manual",
        reason: "google_business_not_connected",
        text,
        landingUrl,
        message: "Copiá el texto y publicalo desde Google Business Profile.",
      });
    }

    // OAuth token retrieval and Local Posts publishing are deliberately kept behind
    // the encrypted credential adapter. Until OAuth is completed, preserve manual fallback.
    return NextResponse.json({
      mode: "manual",
      reason: "google_oauth_publisher_pending",
      text,
      landingUrl,
      message: "La cuenta está vinculada, pero la publicación automática requiere completar el adaptador OAuth.",
    });
  } catch (error) {
    console.error("Google Business dispatch failed", error);
    return NextResponse.json({ error: "Google Business dispatch failed" }, { status: 500 });
  }
}
