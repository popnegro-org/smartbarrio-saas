import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

type OfferRow = { id: string; tenant_id: string };

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const user = await getSupabaseUser(token);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      tenantId?: unknown; title?: unknown; description?: unknown; offerPrice?: unknown;
      channels?: { push?: unknown; whatsapp?: unknown; google?: unknown; instagram?: unknown };
    };
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const offerPrice = body.offerPrice === undefined ? null : Number(body.offerPrice);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || title.length < 3 || title.length > 100 ||
        (offerPrice !== null && (!Number.isFinite(offerPrice) || offerPrice < 0))) {
      return NextResponse.json({ error: "Datos de oferta inválidos" }, { status: 400 });
    }

    const channels = {
      push: body.channels?.push === true,
      whatsapp: body.channels?.whatsapp === true,
      google: body.channels?.google === true,
      instagram: body.channels?.instagram === true,
    };
    const rows = await supabaseRequest<OfferRow[]>("offers?select=id,tenant_id", {
      method: "POST",
      token,
      prefer: "return=representation",
      body: [{
        tenant_id: tenantId, title, description: description || null, offer_price: offerPrice,
        status: "published", published_at: new Date().toISOString(), created_by: user.id, channels,
      }],
    });
    const offer = rows[0];
    if (!offer) throw new Error("Offer insert returned no row");

    const eventId = randomUUID();
    const webhookBase = process.env.N8N_WEBHOOK_BASE_URL;
    const secret = process.env.AUTOMATION_SECRET;
    let automationPending = false;
    if (webhookBase && secret) {
      try {
        const webhook = await fetch(`${webhookBase.replace(/\/$/, "")}/webhook/smartbarrio/offers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-automation-secret": secret },
          body: JSON.stringify({ tenantId: offer.tenant_id, offerId: offer.id, eventId }),
          signal: AbortSignal.timeout(8000),
        });
        automationPending = !webhook.ok;
      } catch {
        automationPending = true;
      }
    } else {
      automationPending = true;
    }

    return NextResponse.json({ success: true, offerId: offer.id, automationPending }, { status: 201 });
  } catch (error) {
    console.error("Offer creation failed", error);
    return NextResponse.json({ error: "No se pudo publicar la oferta" }, { status: 400 });
  }
}
