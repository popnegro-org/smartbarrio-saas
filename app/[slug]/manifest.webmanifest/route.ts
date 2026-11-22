import type { MetadataRoute } from "next";
import { NextResponse } from "next/server";
import { supabaseRequest } from "@/lib/supabase/rest";

type Tenant = { slug: string; name: string; description: string | null };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rows = await supabaseRequest<Tenant[]>(
    "tenants?select=slug,name,description&slug=eq." + encodeURIComponent(slug) + "&is_published=eq.true&limit=1",
  );
  const store = rows[0];
  if (!store) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });

  const manifest: MetadataRoute.Manifest = {
    id: "/" + slug,
    name: store.name + " | SmartBarrio",
    short_name: store.name.slice(0, 12),
    description: store.description ?? "Productos, servicios y ofertas de tu comercio local.",
    start_url: "/" + slug,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#009966",
    icons: [
      { src: "/icons/smartbarrio.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
