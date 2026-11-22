import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

type Membership = { tenant_id: string };

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = (await request.json()) as { tenantId?: unknown };
  const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ error: "Comercio inválido" }, { status: 400 });
  const memberships = await supabaseRequest<Membership[]>(
    "tenant_members?select=tenant_id&tenant_id=eq." + tenantId,
    { token },
  );
  if (!memberships.length) return NextResponse.json({ error: "Sin acceso a este comercio" }, { status: 403 });
  const response = NextResponse.json({ success: true });
  response.cookies.set("sb-active-tenant", tenantId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
