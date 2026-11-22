import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";
import { getGoogleAccessToken } from "@/lib/integrations/google-token";
import { formatOpeningHoursText, normalizeOpeningHours, DAYS } from "@/lib/commerce/opening-hours";

type Membership = { role: string };
type Tenant = { opening_hours: Record<string, unknown> };
type Integration = { id: string; external_account_id: string | null; status: string; token_expires_at: string | null };

const GOOGLE_DAYS: Record<(typeof DAYS)[number], string> = {
  monday: "MONDAY", tuesday: "TUESDAY", wednesday: "WEDNESDAY",
  thursday: "THURSDAY", friday: "FRIDAY", saturday: "SATURDAY", sunday: "SUNDAY",
};

function manual(text: string, reason: string) {
  return NextResponse.json({
    mode: "manual", reason, text,
    message: "La sincronización automática no está disponible. Copiá estos horarios y actualizalos en Google Business Profile.",
  });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const body = await request.json() as { tenantId?: unknown };
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ error: "Comercio inválido" }, { status: 400 });

    const members = await supabaseRequest<Membership[]>(
      "tenant_members?select=role&tenant_id=eq." + tenantId + "&limit=1", { token },
    );
    if (!members[0] || !["owner", "admin"].includes(members[0].role)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const tenants = await supabaseRequest<Tenant[]>(
      "tenants?select=opening_hours&id=eq." + tenantId + "&limit=1", { token },
    );
    if (!tenants[0]) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    const hours = normalizeOpeningHours(tenants[0].opening_hours);
    const text = formatOpeningHoursText(hours);
    const periods = DAYS.flatMap((day) => {
      const item = hours[day];
      if (item.closed || item.open >= item.close) return [];
      const [openHour, openMinute] = item.open.split(":").map(Number);
      const [closeHour, closeMinute] = item.close.split(":").map(Number);
      return [{
        openDay: GOOGLE_DAYS[day],
        openTime: { hours: openHour, minutes: openMinute },
        closeDay: GOOGLE_DAYS[day],
        closeTime: { hours: closeHour, minutes: closeMinute },
      }];
    });
    if (!periods.length) return manual(text, "no_opening_hours");

    const integrations = await supabaseRequest<Integration[]>(
      "social_integrations?select=id,external_account_id,status,token_expires_at&tenant_id=eq." + tenantId + "&provider=eq.google_business&limit=1",
      { admin: true },
    );
    const integration = integrations[0];
    if (!integration || integration.status !== "connected" || !integration.external_account_id) {
      return manual(text, "google_not_connected");
    }

    const locationId = integration.external_account_id.split("/").slice(-1)[0];
    if (!locationId || !/^[A-Za-z0-9_-]+$/.test(locationId)) return manual(text, "invalid_google_location");
    const accessToken = await getGoogleAccessToken(integration);
    const response = await fetch(
      "https://mybusinessbusinessinformation.googleapis.com/v1/locations/" + locationId + "?updateMask=regularHours",
      {
        method: "PATCH",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ regularHours: { periods } }),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      console.error("Google hours sync failed", response.status, (await response.text()).slice(0, 300));
      return manual(text, "google_api_unavailable");
    }

    await supabaseRequest("social_integrations?id=eq." + integration.id, {
      method: "PATCH", admin: true, prefer: "return=minimal",
      body: { last_synced_at: new Date().toISOString(), last_error: null },
    });
    return NextResponse.json({ mode: "synced", message: "Horarios sincronizados con Google Business Profile." });
  } catch (error) {
    console.error("Google hours sync failed", error);
    return manual("No se pudieron preparar los horarios. Revisá la configuración del comercio.", "sync_error");
  }
}
