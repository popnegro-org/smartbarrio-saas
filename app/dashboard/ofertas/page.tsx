import { redirect } from "next/navigation";
import { getCurrentSession, supabaseRequest } from "@/lib/supabase/rest";
import { OfferForm } from "./OfferForm";

type Membership = { tenant_id: string; role: string };

export default async function OffersPage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) redirect("/login");
  const memberships = await supabaseRequest<Membership[]>(
    `tenant_members?select=tenant_id,role&user_id=eq.${user.id}&order=created_at.asc&limit=1`,
    { token: accessToken },
  );
  if (!memberships.length) redirect("/dashboard/onboarding");

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Ofertas</h1>
      <p className="text-sm text-gray-600">Publicá una promoción y elegí los canales disponibles. Los canales sin integración activa quedan pendientes.</p>
      <OfferForm tenantId={memberships[0].tenant_id} />
    </section>
  );
}
