import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readWhatsAppCredential, storeWhatsAppCredential } from "@/lib/integrations/whatsapp-credentials";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

type Membership = { role: string };
type Instance = { id: string; instance_name: string; connection_status: string; phone_number: string | null };
type EvolutionResult = { qrcode?: { base64?: string; code?: string }; base64?: string; code?: string };

export const runtime = "nodejs";

async function authorizeTenant(request: NextRequest, tenantId: string) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token) return { error: "No autenticado", status: 401 as const };
  const user = await getSupabaseUser(token);
  if (!user) return { error: "No autenticado", status: 401 as const };
  const memberships = await supabaseRequest<Membership[]>(
    "tenant_members?select=role&tenant_id=eq." + tenantId + "&user_id=eq." + user.id + "&limit=1",
    { token },
  );
  if (!memberships[0] || !["owner", "admin"].includes(memberships[0].role)) {
    return { error: "Sin permisos para administrar WhatsApp", status: 403 as const };
  }
  return { token, user };
}

function evolutionConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl || !apiKey || !webhookSecret || !appUrl) throw new Error("Evolution API environment is incomplete");
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, webhookSecret, appUrl: appUrl.replace(/\/$/, "") };
}

async function getQr(instance: Instance): Promise<EvolutionResult> {
  const { baseUrl } = evolutionConfig();
  const instanceToken = await readWhatsAppCredential(instance.id);
  if (!instanceToken) throw new Error("Encrypted Evolution instance token is unavailable");
  const response = await fetch(baseUrl + "/instance/connect/" + encodeURIComponent(instance.instance_name), {
    headers: { apikey: instanceToken }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Evolution QR request failed with HTTP " + response.status);
  return (await response.json()) as EvolutionResult;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tenantId?: unknown };
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
    const auth = await authorizeTenant(request, tenantId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const config = evolutionConfig();
    const existing = await supabaseRequest<Instance[]>(
      "whatsapp_instances?select=id,instance_name,connection_status,phone_number&tenant_id=eq." + tenantId + "&limit=1",
      { admin: true },
    );
    if (existing[0]) {
      if (existing[0].connection_status === "connected") {
        return NextResponse.json({ status: "connected", phoneNumber: existing[0].phone_number });
      }
      const qr = await getQr(existing[0]);
      return NextResponse.json({
        status: existing[0].connection_status,
        instanceName: existing[0].instance_name,
        qr: qr.base64 ?? qr.qrcode?.base64 ?? null,
      });
    }

    const instanceName = "sb" + tenantId.replace(/-/g, "").slice(0, 12);
    const instanceToken = randomBytes(32).toString("hex");
    const inserted = await supabaseRequest<Instance[]>("whatsapp_instances?select=id,instance_name,connection_status,phone_number", {
      method: "POST", admin: true, prefer: "return=representation",
      body: [{ tenant_id: tenantId, instance_name: instanceName, connection_status: "creating" }],
    });
    const instance = inserted[0];
    if (!instance) throw new Error("Could not persist WhatsApp instance");
    await storeWhatsAppCredential(instance.id, instanceToken);

    const webhookUrl = config.appUrl + "/api/webhooks/evolution/" + config.webhookSecret;
    const created = await fetch(config.baseUrl + "/instance/create", {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceName,
        token: instanceToken,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          headers: { "x-evolution-webhook-secret": config.webhookSecret },
          events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });

    if (!created.ok) {
      const detail = await created.text();
      await supabaseRequest("whatsapp_instances?tenant_id=eq." + tenantId, {
        method: "PATCH", admin: true, prefer: "return=minimal",
        body: { connection_status: "error", last_error: "Evolution create returned HTTP " + created.status },
      });
      console.error("Evolution instance creation failed", detail.slice(0, 500));
      return NextResponse.json({ error: "No se pudo crear la instancia de WhatsApp" }, { status: 502 });
    }

    const result = (await created.json()) as EvolutionResult;
    await supabaseRequest("whatsapp_instances?tenant_id=eq." + tenantId, {
      method: "PATCH", admin: true, prefer: "return=minimal",
      body: { connection_status: "qr_pending", qr_expires_at: new Date(Date.now() + 120000).toISOString(), last_error: null },
    });
    let qr = result.qrcode?.base64 ?? result.base64 ?? null;
    if (!qr) {
      try {
        const refreshed = await getQr(instance);
        qr = refreshed.base64 ?? refreshed.qrcode?.base64 ?? null;
      } catch { /* The connection webhook will update the state if QR generation is delayed. */ }
    }
    return NextResponse.json({ status: "qr_pending", instanceName, qr }, { status: 201 });
  } catch (error) {
    console.error("WhatsApp instance setup failed", error);
    return NextResponse.json({ error: "No se pudo iniciar la conexión de WhatsApp" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
    const auth = await authorizeTenant(request, tenantId);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const rows = await supabaseRequest<Instance[]>(
      "whatsapp_instances?select=id,instance_name,connection_status,phone_number&tenant_id=eq." + tenantId + "&limit=1",
      { admin: true },
    );
    const instance = rows[0];
    if (!instance) return NextResponse.json({ status: "disconnected" });
    if (instance.connection_status === "connected") {
      return NextResponse.json({ status: "connected", phoneNumber: instance.phone_number });
    }
    const qr = await getQr(instance);
    return NextResponse.json({
      status: instance.connection_status,
      instanceName: instance.instance_name,
      qr: qr.base64 ?? qr.qrcode?.base64 ?? null,
    });
  } catch (error) {
    console.error("WhatsApp QR refresh failed", error);
    return NextResponse.json({ error: "No se pudo actualizar el código QR" }, { status: 502 });
  }
}
