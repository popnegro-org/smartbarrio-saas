import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      name?: unknown; slug?: unknown; businessType?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const allowed = ["almacen", "rotiseria", "peluqueria", "ferreteria", "otro"];
    const businessType = typeof body.businessType === "string" ? body.businessType : "otro";

    if (name.length < 2 || name.length > 120 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !allowed.includes(businessType)) {
      return NextResponse.json({ error: "Datos del comercio inválidos" }, { status: 400 });
    }

    const tenantId = await supabaseRequest<string>("rpc/create_tenant", {
      method: "POST",
      token,
      body: { p_name: name, p_slug: slug, p_business_type: businessType },
    });
    return NextResponse.json({ success: true, tenantId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear el comercio";
    const conflict = /duplicate key|unique constraint/i.test(message);
    return NextResponse.json({ error: conflict ? "Esa dirección ya está ocupada" : "No se pudo crear el comercio" }, { status: conflict ? 409 : 400 });
  }
}
