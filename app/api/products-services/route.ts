import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const body = (await request.json()) as { tenantId?: unknown; name?: unknown; description?: unknown; price?: unknown; kind?: unknown };
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const kind = body.kind === "service" ? "service" : "product";
    const price = body.price === "" || body.price === undefined || body.price === null ? null : Number(body.price);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || name.length < 1 || name.length > 160 ||
        (price !== null && (!Number.isFinite(price) || price < 0))) {
      return NextResponse.json({ error: "Datos del catálogo inválidos" }, { status: 400 });
    }
    const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await supabaseRequest("products_services", {
      method: "POST", token, prefer: "return=minimal",
      body: [{ tenant_id: tenantId, kind, name, slug: slug + "-" + crypto.randomUUID().slice(0, 8), description: typeof body.description === "string" ? body.description : null, price, is_available: true }],
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Catalog item creation failed", error);
    return NextResponse.json({ error: "No se pudo agregar el elemento" }, { status: 400 });
  }
}
