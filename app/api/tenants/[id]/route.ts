import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Comercio inválido" }, { status: 400 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const allowed = ["name", "description", "phone", "whatsapp_number", "address", "city", "province", "instagram_url", "google_review_url", "logo_url", "opening_hours", "is_published"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) if (body[key] !== undefined) update[key] = body[key];
    if (typeof update.name === "string" && (update.name.trim().length < 2 || update.name.trim().length > 120)) {
      return NextResponse.json({ error: "Nombre comercial inválido" }, { status: 400 });
    }
    if (update.opening_hours !== undefined) {
      if (!update.opening_hours || typeof update.opening_hours !== "object" || Array.isArray(update.opening_hours)) {
        return NextResponse.json({ error: "Horarios inválidos" }, { status: 400 });
      }
      const hours = update.opening_hours as Record<string, unknown>;
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      for (const day of days) {
        const item = hours[day];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return NextResponse.json({ error: "Faltan horarios para " + day }, { status: 400 });
        }
        const schedule = item as Record<string, unknown>;
        const validTime = (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
        if (typeof schedule.closed !== "boolean" || !validTime(schedule.open) || !validTime(schedule.close) ||
            (!schedule.closed && schedule.open >= schedule.close)) {
          return NextResponse.json({ error: "Rango horario inválido para " + day }, { status: 400 });
        }
      }
    }
    for (const key of ["instagram_url", "google_review_url"]) {
      const value = update[key];
      if (typeof value === "string" && value && !/^https:\/\//i.test(value)) {
        return NextResponse.json({ error: "Las direcciones de redes deben usar HTTPS" }, { status: 400 });
      }
    }
    if (typeof update.whatsapp_number === "string" && update.whatsapp_number.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Número de WhatsApp inválido" }, { status: 400 });
    }
    const rows = await supabaseRequest<{ id: string }[]>("tenants?id=eq." + id + "&select=id", {
      method: "PATCH", token, prefer: "return=representation", body: update,
    });
    if (!rows.length) return NextResponse.json({ error: "Comercio no encontrado o sin permisos" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tenant update failed", error);
    return NextResponse.json({ error: "No se pudieron guardar los datos" }, { status: 400 });
  }
}
