import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession, supabaseRequest } from "@/lib/supabase/rest";
import { WhatsAppConnection } from "@/components/dashboard/WhatsAppConnection";

type Membership = { tenant_id: string; role: string };
type Instance = { connection_status: string };
type SocialIntegration = { provider: string; status: string; account_name: string | null };

export default async function IntegrationsPage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) redirect("/login");
  const memberships = await supabaseRequest<Membership[]>(
    "tenant_members?select=tenant_id,role&user_id=eq." + user.id + "&order=created_at.asc&limit=1",
    { token: accessToken },
  );
  if (!memberships.length) redirect("/dashboard/onboarding");
  const tenantId = memberships[0].tenant_id;
  const canManage = ["owner", "admin"].includes(memberships[0].role);
  const [instances, social] = await Promise.all([
    supabaseRequest<Instance[]>("whatsapp_instances?select=connection_status&tenant_id=eq." + tenantId + "&limit=1", { token: accessToken }),
    supabaseRequest<SocialIntegration[]>("social_integrations?select=provider,status,account_name&tenant_id=eq." + tenantId, { token: accessToken }),
  ]);
  const google = social.find((item) => item.provider === "google_business");
  const instagram = social.find((item) => item.provider === "instagram");

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="mt-1 text-sm text-gray-600">WhatsApp Simple funciona con un enlace directo. Las conexiones adicionales habilitan automatizaciones.</p>
      </div>
      <article className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">WhatsApp Simple</h2>
        <p className="mt-1 text-sm text-gray-600">Configurá el número desde Mi comercio y recibí pedidos mediante wa.me.</p>
      </article>
      <WhatsAppConnection tenantId={tenantId} initialStatus={instances[0]?.connection_status ?? "disconnected"} />
      <article className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Google Business Profile</h2><p className="mt-1 text-sm text-gray-600">{google?.account_name ?? "Publicación de ofertas y novedades locales."}</p></div>
          <span className="rounded-full border px-3 py-1 text-xs">{google?.status ?? "No conectado"}</span>
        </div>
        {canManage && <Link href={"/api/integrations/google/connect?tenantId=" + tenantId} className="mt-4 inline-flex rounded-lg border px-4 py-2 text-sm font-medium">Conectar Google</Link>}
        <p className="mt-3 text-xs text-gray-500">Si la API no está aprobada, se mantiene disponible la publicación manual.</p>
      </article>
      <article className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Instagram</h2><p className="mt-1 text-sm text-gray-600">{instagram?.account_name ?? "Mensajes directos de una cuenta profesional."}</p></div>
          <span className="rounded-full border px-3 py-1 text-xs">{instagram?.status ?? "No conectado"}</span>
        </div>
        {canManage && <Link href={"/api/integrations/meta/connect?tenantId=" + tenantId} className="mt-4 inline-flex rounded-lg border px-4 py-2 text-sm font-medium">Conectar Instagram</Link>}
        <p className="mt-3 text-xs text-gray-500">Requiere cuenta profesional, página vinculada y permisos aprobados por Meta.</p>
      </article>
    </section>
  );
}
