import { cookies } from "next/headers";
import { supabaseRequest } from "@/lib/supabase/rest";

type Membership = { tenant_id: string; role: string };
export type TenantSummary = { id: string; name: string; slug: string; is_published: boolean };

export async function getTenantContext(userId: string, accessToken: string) {
  const memberships = await supabaseRequest<Membership[]>(
    "tenant_members?select=tenant_id,role&user_id=eq." + userId + "&order=created_at.asc&limit=50",
    { token: accessToken },
  );
  if (!memberships.length) return null;
  const ids = memberships.map((item) => item.tenant_id);
  const tenants = await supabaseRequest<TenantSummary[]>(
    "tenants?select=id,name,slug,is_published&id=in.(" + ids.join(",") + ")",
    { token: accessToken },
  );
  if (!tenants.length) return null;
  const store = await cookies();
  const requestedId = store.get("sb-active-tenant")?.value;
  const active = tenants.find((tenant) => tenant.id === requestedId) ?? tenants[0];
  const membership = memberships.find((item) => item.tenant_id === active.id);
  if (!membership) return null;
  return { tenant: active, role: membership.role, tenants };
}
