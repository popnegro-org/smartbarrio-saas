import { redirect } from "next/navigation";
import { getCurrentSession, supabaseRequest } from "@/lib/supabase/rest";
import { CommerceForm } from "./CommerceForm";

type Membership = { tenant_id: string };
type Tenant = {
  id: string; name: string; description: string | null; phone: string | null; whatsapp_number: string | null;
  address: string | null; city: string | null; province: string | null; instagram_url: string | null;
  google_review_url: string | null; is_published: boolean;
};

export default async function CommercePage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) redirect("/login");
  const memberships = await supabaseRequest<Membership[]>("tenant_members?select=tenant_id&user_id=eq." + user.id + "&order=created_at.asc&limit=1", { token: accessToken });
  if (!memberships.length) redirect("/dashboard/onboarding");
  const rows = await supabaseRequest<Tenant[]>("tenants?select=id,name,description,phone,whatsapp_number,address,city,province,instagram_url,google_review_url,is_published&id=eq." + memberships[0].tenant_id + "&limit=1", { token: accessToken });
  if (!rows[0]) redirect("/dashboard/onboarding");
  return <section className="mx-auto max-w-3xl space-y-4"><h1 className="text-2xl font-bold">Mi comercio</h1><p className="text-sm text-gray-600">Completá los datos que verán tus clientes en la página pública.</p><CommerceForm tenant={rows[0]} /></section>;
}
