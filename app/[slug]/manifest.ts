import type { MetadataRoute } from "next";
import { supabaseRequest } from "@/lib/supabase/rest";

type Tenant = { slug: string; name: string; description: string | null };

export default async function manifest({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<MetadataRoute.Manifest> {
  const { slug } = await params;
  const rows = await supabaseRequest<Tenant[]>(
    "tenants?select=slug,name,description&slug=eq." + encodeURIComponent(slug) + "&is_published=eq.true&limit=1",
  );
  const store = rows[0];
  const name = store?.name ?? "SmartBarrio";
  return {
    id: "/" + slug,
    name: name + " | SmartBarrio",
    short_name: name.slice(0, 12),
    description: store?.description ?? "Productos, servicios y ofertas de tu comercio local.",
    start_url: "/" + slug,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#009966",
    icons: [
      { src: "/icons/smartbarrio.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
