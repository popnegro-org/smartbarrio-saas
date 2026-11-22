import { redirect } from "next/navigation";
import { getCurrentSession, supabaseRequest } from "@/lib/supabase/rest";
import { WhatsAppConnection } from "@/components/dashboard/WhatsAppConnection";

type Membership = { tenant_id: string; role: string };
type Instance = { connection_status: string };

export default async function IntegrationsPage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) redirect("/login");
  const memberships = await supabaseRequest<Membership[]>(
    "tenant_members?select=tenant_id,role&user_id=eq." + user.id + "&order=created_at.asc&limit=1",
    { token: accessToken },
  );
  if (!memberships.length) redirect("/dashboard/onboarding");
  const instances = await supabaseRequest<Instance[]>(
    "whatsapp_instances?select=connection_status&tenant_id=eq." + memberships[0].tenant_id + "&limit=1",
    { token: accessToken },
  );
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="mt-1 text-sm text-gray-600">WhatsApp Simple funciona con un enlace directo. La conexión QR habilita automatizaciones adicionales.</p>
      </div>
      <article className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">WhatsApp Simple</h2>
        <p className="mt-1 text-sm text-gray-600">Configurá tu número desde los datos del comercio y recibí pedidos mediante wa.me.</p>
      </article>
      <WhatsAppConnection tenantId={memberships[0].tenant_id} initialStatus={instances[0]?.connection_status ?? "disconnected"} />
      <article className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Google Business Profile</h2>
        <p className="mt-1 text-sm text-gray-600">Mientras se completa la autorización OAuth, las ofertas quedan disponibles para copiar y publicar manualmente.</p>
      </article>
      <article className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Instagram</h2>
        <p className="mt-1 text-sm text-gray-600">La integración requiere una cuenta profesional y permisos aprobados de Meta.</p>
      </article>
    </section>
  );
}
