import type { NextRequest } from "next/server";
import { getSupabaseUser, supabaseRequest, type SupabaseUser } from "@/lib/supabase/rest";

type Membership = { role: string };

export type TenantAdminResult =
  | { ok: true; user: SupabaseUser; token: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireTenantAdmin(request: NextRequest, tenantId: string): Promise<TenantAdminResult> {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token) return { ok: false, status: 401, error: "No autenticado" };
  const user = await getSupabaseUser(token);
  if (!user) return { ok: false, status: 401, error: "No autenticado" };
  const rows = await supabaseRequest<Membership[]>(
    "tenant_members?select=role&tenant_id=eq." + tenantId + "&user_id=eq." + user.id + "&limit=1",
    { token },
  );
  if (!rows[0] || !["owner", "admin"].includes(rows[0].role)) {
    return { ok: false, status: 403, error: "Se requieren permisos de propietario o administrador" };
  }
  return { ok: true, user, token };
}

export async function isTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
  const rows = await supabaseRequest<Membership[]>(
    "tenant_members?select=role&tenant_id=eq." + tenantId + "&user_id=eq." + userId + "&limit=1",
    { admin: true },
  );
  return Boolean(rows[0] && ["owner", "admin"].includes(rows[0].role));
}
