import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/supabase/rest";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export default async function DashboardPage() {
  const { user, accessToken } = await getCurrentSession();
  if (!user || !accessToken) redirect("/login");
  const context = await getTenantContext(user.id, accessToken);
  if (!context) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-8">
        <h1 className="text-2xl font-bold">Activá tu comercio</h1>
        <p className="mt-2 text-gray-600">Creá tu página pública y empezá a recibir consultas por WhatsApp.</p>
        <Link href="/dashboard/onboarding" className="mt-5 inline-flex rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white">Configurar comercio</Link>
      </section>
    );
  }
  const tenant = context.tenant;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header><p className="text-sm text-gray-500">Panel del comercio</p><h1 className="mt-1 text-3xl font-bold">{tenant.name}</h1></header>
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border bg-white p-5"><p className="text-sm text-gray-500">Estado de la página</p><p className="mt-2 text-xl font-semibold">{tenant.is_published ? "Publicada" : "Borrador"}</p></article>
        <article className="rounded-xl border bg-white p-5"><p className="text-sm text-gray-500">Tu dirección pública</p><Link href={"/" + tenant.slug} target="_blank" className="mt-2 block break-all font-semibold text-emerald-700">/{tenant.slug}</Link></article>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/dashboard/comercio" className="rounded-xl border bg-white p-5 font-semibold">Editar datos del comercio</Link>
        <Link href="/dashboard/catalogo" className="rounded-xl border bg-white p-5 font-semibold">Administrar catálogo</Link>
        <Link href="/dashboard/ofertas" className="rounded-xl border bg-white p-5 font-semibold">Crear oferta</Link>
        <Link href="/dashboard/integraciones" className="rounded-xl border bg-white p-5 font-semibold">Conectar servicios</Link>
      </section>
    </div>
  );
}
