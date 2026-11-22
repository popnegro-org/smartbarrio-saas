import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { supabaseRequest } from "@/lib/supabase/rest";

type Integration = { status: string; external_account_id: string | null };

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      tenantId?: unknown; channel?: unknown; sender?: unknown; reply?: unknown; idempotencyKey?: unknown;
    };
    if (body.channel !== "instagram") return NextResponse.json({ skipped: true, reason: "channel_mismatch" });
    if (typeof body.tenantId !== "string" || typeof body.sender !== "string" ||
        typeof body.reply !== "string" || typeof body.idempotencyKey !== "string") {
      return NextResponse.json({ error: "Invalid reply payload" }, { status: 400 });
    }
    const integrations = await supabaseRequest<Integration[]>(
      "social_integrations?select=status,external_account_id&tenant_id=eq." + body.tenantId +
      "&provider=eq.instagram&limit=1",
      { admin: true },
    );
    const integration = integrations[0];
    if (!integration || integration.status !== "connected" || !integration.external_account_id) {
      return NextResponse.json({ skipped: true, reason: "instagram_not_connected" });
    }

    // Sending requires a valid Meta messaging token and Instagram-scoped permissions.
    // Until OAuth credentials are stored in the private encrypted credential vault,
    // do not attempt a provider call or report a successful delivery.
    return NextResponse.json({
      mode: "manual",
      reason: "meta_messaging_credentials_pending",
      reply: body.reply,
      message: "La respuesta está preparada, pero falta completar la autorización de mensajería de Meta.",
    }, { status: 202 });
  } catch (error) {
    console.error("Instagram reply preparation failed", error);
    return NextResponse.json({ error: "Instagram reply preparation failed" }, { status: 500 });
  }
}
