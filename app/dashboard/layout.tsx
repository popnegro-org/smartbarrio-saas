import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/supabase/rest";

const navigation = [
  ["Inicio", "/dashboard"],
  ["Mi comercio", "/dashboard/comercio"],
  ["Catálogo", "/dashboard/catalogo"],
  ["Ofertas", "/dashboard/ofertas"],
  ["Integraciones", "/dashboard/integraciones"],
] as const;

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user } = await getCurrentSession();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="border-b bg-white p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <Link href="/dashboard" className="mb-5 block text-xl font-bold">SmartBarrio</Link>
        <p className="mb-4 truncate text-xs text-gray-500">{user.email}</p>
        <nav className="flex gap-2 overflow-x-auto md:flex-col">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2.5 text-sm hover:bg-gray-100">
              {label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" className="mt-6">
          <button className="text-sm text-gray-500 hover:text-gray-900">Cerrar sesión</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-8">{children}</main>
    </div>
  );
}
