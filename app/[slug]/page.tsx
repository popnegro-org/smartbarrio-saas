import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { StorefrontActions, type StoreProduct } from "@/components/StorefrontActions";
import { supabaseRequest } from "@/lib/supabase/rest";

type Tenant = {
  id: string; slug: string; name: string; description: string | null; business_type: string;
  phone: string | null; whatsapp_number: string | null; address: string | null; city: string | null;
  province: string | null; opening_hours: Record<string, unknown>; instagram_url: string | null;
  google_review_url: string | null; logo_url: string | null; is_published: boolean;
};
type Offer = { id: string; title: string; description: string | null; offer_price: number | null; expires_at: string | null };

async function getStore(slug: string): Promise<Tenant | null> {
  const rows = await supabaseRequest<Tenant[]>(
    "tenants?select=id,slug,name,description,business_type,phone,whatsapp_number,address,city,province,opening_hours,instagram_url,google_review_url,logo_url,is_published&slug=eq." +
    encodeURIComponent(slug) + "&is_published=eq.true&limit=1",
  );
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const store = await getStore(slug);
    if (!store) return { title: "Comercio no encontrado" };
    return {
      title: store.name + " | SmartBarrio",
      description: store.description ?? "Productos, servicios y contacto de " + store.name + ".",
      alternates: { canonical: "/" + store.slug },
      openGraph: { title: store.name, description: store.description ?? store.name, images: store.logo_url ? [store.logo_url] : [] },
    };
  } catch {
    return { title: "SmartBarrio" };
  }
}

export default async function PublicStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let store: Tenant | null;
  try {
    store = await getStore(slug);
  } catch {
    notFound();
  }
  if (!store) notFound();

  const [products, offers] = await Promise.all([
    supabaseRequest<StoreProduct[]>(
      "products_services?select=id,name,slug,description,price,image_url,kind&tenant_id=eq." +
      store.id + "&is_available=eq.true&order=sort_order.asc",
    ),
    supabaseRequest<Offer[]>(
      "offers?select=id,title,description,offer_price,expires_at&tenant_id=eq." +
      store.id + "&status=eq.published&starts_at=lte." + encodeURIComponent(new Date().toISOString()) + "&order=created_at.desc",
    ),
  ]);
  const now = Date.now();
  const activeOffers = offers.filter((offer) => !offer.expires_at || new Date(offer.expires_at).getTime() > now);
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://smartbarrio.vercel.app").replace(/\/$/, "");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: store.name,
    description: store.description ?? undefined,
    url: origin + "/" + store.slug,
    telephone: store.phone ?? undefined,
    image: store.logo_url ?? undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: store.address ?? undefined,
      addressLocality: store.city ?? undefined,
      addressRegion: store.province ?? "Mendoza",
      addressCountry: "AR",
    },
    sameAs: [store.instagram_url].filter(Boolean),
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      <Script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" strategy="afterInteractive" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-8">
          {store.logo_url && <img src={store.logo_url} alt={"Logo de " + store.name} className="h-16 w-16 rounded-xl object-cover" />}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Comercio local · Mendoza</p>
            <h1 className="mt-1 text-3xl font-bold">{store.name}</h1>
            {store.description && <p className="mt-2 text-sm text-gray-600">{store.description}</p>}
            <p className="mt-2 text-sm text-gray-500">{[store.address, store.city, store.province].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8">
        {activeOffers.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-bold">Ofertas vigentes</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeOffers.map((offer) => (
                <article key={offer.id} className="rounded-xl border bg-white p-5">
                  <h3 className="font-semibold">{offer.title}</h3>
                  {offer.description && <p className="mt-2 text-sm text-gray-600">{offer.description}</p>}
                  {offer.offer_price !== null && <p className="mt-3 text-lg font-bold">{Number(offer.offer_price).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Catálogo</p>
          <h2 className="mb-5 mt-1 text-xl font-bold">Productos y servicios</h2>
          <StorefrontActions tenant={store} products={products} />
        </section>
        <footer className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm">
          {store.instagram_url && <a href={store.instagram_url} target="_blank" rel="noopener noreferrer" className="underline">Instagram</a>}
          {store.google_review_url && <a href={store.google_review_url} target="_blank" rel="noopener noreferrer" className="underline">Dejar una reseña en Google</a>}
        </footer>
      </div>
    </main>
  );
}
