import Link from "next/link";
import { getCurrentSession, supabaseRequest } from "@/lib/supabase/rest";

type Membership = { tenant_id: string; role: string };
type Tenant = { id: string; name: string; slug: string; is_published: boolean };

export default async function DashboardPage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) return null;

  const memberships = await supabaseRequest<Membership[]>(
    `tenant_members?select=tenant_id,role&user_id=eq.${user.id}&order=created_at.asc&limit=10`,
    { token: accessToken },
  );

  if (!memberships.length) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8">
        <h1 className="text-2xl font-bold">Activá tu comercio</h1>
        <p className="mt-2 text-gray-600">Creá tu página pública y empezá a recibir consultas por WhatsApp.</p>
        <Link href="/dashboard/onboarding" className="mt-5 inline-flex rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white">
          Configurar comercio
        </Link>
      </section>
    );
  }

  const tenant = await supabaseRequest<Tenant[]>(
    `tenants?select=id,name,slug,is_published&id=eq.${memberships[0].tenant_id}&limit=1`,
    { token: accessToken },
  );
  const current = tenant[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm text-gray-500">Panel del comercio</p>
        <h1 className="mt-1 text-3xl font-bold">{current?.name ?? "Mi comercio"}</h1>
      </header>
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Estado de la página</p>
          <p className="mt-2 text-xl font-semibold">{current?.is_published ? "Publicada" : "Borrador"}</p>
        </article>
        <article className="rounded-xl border bg-white p-5">
          <p className="text-sm text-gray-500">Tu dirección pública</p>
          {current && <Link href={`/${current.slug}`} target="_blank" className="mt-2 block break-all font-semibold text-emerald-700">/{current.slug}</Link>}
        </article>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/dashboard/comercio" className="rounded-xl border bg-white p-5 font-semibold">Editar datos del comercio</Link>
        <Link href="/dashboard/catalogo" className="rounded-xl border bg-white p-5 font-semibold">Administrar catálogo</Link>
        <Link href="/dashboard/ofertas" className="rounded-xl border bg-white p-5 font-semibold">Crear oferta</Link>
        <Link href="/dashboard/integraciones" className="rounded-xl border bg-white p-5 font-semibold">Conectar integraciones</Link>
      </section>
    </div>
  );
}
