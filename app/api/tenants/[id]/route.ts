import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Comercio inválido" }, { status: 400 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const allowed = ["name", "description", "phone", "whatsapp_number", "address", "city", "province", "instagram_url", "google_review_url", "is_published"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) if (body[key] !== undefined) update[key] = body[key];
    if (typeof update.name === "string" && (update.name.trim().length < 2 || update.name.trim().length > 120)) {
      return NextResponse.json({ error: "Nombre comercial inválido" }, { status: 400 });
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
