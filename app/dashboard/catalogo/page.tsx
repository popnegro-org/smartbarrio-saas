import { redirect } from "next/navigation";
import { getCurrentSession, supabaseRequest } from "@/lib/supabase/rest";
import { CatalogForm } from "./CatalogForm";

type Membership = { tenant_id: string };
type Item = { id: string; name: string; kind: string; price: number | null; is_available: boolean };

export default async function CatalogPage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) redirect("/login");
  const memberships = await supabaseRequest<Membership[]>("tenant_members?select=tenant_id&user_id=eq." + user.id + "&order=created_at.asc&limit=1", { token: accessToken });
  if (!memberships.length) redirect("/dashboard/onboarding");
  const items = await supabaseRequest<Item[]>("products_services?select=id,name,kind,price,is_available&tenant_id=eq." + memberships[0].tenant_id + "&order=sort_order.asc", { token: accessToken });
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Catálogo</h1>
      <CatalogForm tenantId={memberships[0].tenant_id} />
      <div className="space-y-2">
        <h2 className="font-semibold">Elementos publicados</h2>
        {items.length ? items.map((item) => <article key={item.id} className="flex items-center justify-between rounded-lg border bg-white p-4"><div><strong>{item.name}</strong><p className="text-xs text-gray-500">{item.kind === "service" ? "Servicio" : "Producto"}</p></div><span className="text-sm">{item.price === null ? "Consultar" : "$" + Number(item.price).toLocaleString("es-AR")}</span></article>) : <p className="rounded-lg border bg-white p-4 text-sm text-gray-500">Todavía no hay elementos en el catálogo.</p>}
      </div>
    </section>
  );
}
