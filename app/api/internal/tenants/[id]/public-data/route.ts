import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { supabaseRequest } from "@/lib/supabase/rest";

type Tenant = { id: string; name: string; slug: string; is_published: boolean; opening_hours: Record<string, unknown> };
type CatalogItem = { name: string; kind: string; price: number | null; is_available: boolean };

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid tenant id" }, { status: 400 });

  try {
    const tenants = await supabaseRequest<Tenant[]>(
      "tenants?select=id,name,slug,is_published,opening_hours&id=eq." + id + "&limit=1",
      { admin: true },
    );
    const tenant = tenants[0];
    if (!tenant?.is_published) return NextResponse.json({ error: "Commerce not found" }, { status: 404 });

    const catalog = await supabaseRequest<CatalogItem[]>(
      "products_services?select=name,kind,price,is_available&tenant_id=eq." + id + "&is_available=eq.true&order=sort_order.asc",
      { admin: true },
    );
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const hours = tenant.opening_hours && Object.keys(tenant.opening_hours).length
      ? JSON.stringify(tenant.opening_hours)
      : "Consultá con el comercio";

    return NextResponse.json({
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      landingUrl: appUrl + "/" + tenant.slug,
      openingHours: tenant.opening_hours,
      openingHoursText: hours,
      catalog: catalog.map((item) => ({ name: item.name, kind: item.kind, price: item.price })),
    });
  } catch (error) {
    console.error("Internal tenant data lookup failed", error);
    return NextResponse.json({ error: "Tenant lookup failed" }, { status: 500 });
  }
}
