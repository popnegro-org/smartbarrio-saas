import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "@/lib/supabase/rest";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown; subscriptionId?: unknown };
    if (typeof body.tenantId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.tenantId) ||
        typeof body.subscriptionId !== "string" || body.subscriptionId.length < 8 || body.subscriptionId.length > 200) {
      return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
    }
    await supabaseRequest("push_subscribers?on_conflict=tenant_id,onesignal_subscription_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [{ tenant_id: body.tenantId, onesignal_subscription_id: body.subscriptionId, enabled: true }],
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "No se pudo registrar la suscripción" }, { status: 400 });
  }
}
