import { NextRequest, NextResponse } from "next/server";
import { isInternalRequest } from "@/lib/integrations/internal-auth";
import { supabaseRequest } from "@/lib/supabase/rest";

type Offer = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  channels: Record<string, boolean>;
  status: string;
};
type Tenant = { slug: string; is_published: boolean };

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isInternalRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid offer id" }, { status: 400 });

  try {
    const offers = await supabaseRequest<Offer[]>(
      "offers?select=id,tenant_id,title,description,channels,status&id=eq." + id + "&limit=1",
      { admin: true },
    );
    const offer = offers[0];
    if (!offer || offer.status !== "published") return NextResponse.json({ error: "Offer not found" }, { status: 404 });

    const tenants = await supabaseRequest<Tenant[]>(
      "tenants?select=slug,is_published&id=eq." + offer.tenant_id + "&limit=1",
      { admin: true },
    );
    const tenant = tenants[0];
    if (!tenant?.is_published) return NextResponse.json({ error: "Commerce is not published" }, { status: 404 });

    return NextResponse.json({
      id: offer.id,
      tenantId: offer.tenant_id,
      slug: tenant.slug,
      title: offer.title,
      description: offer.description,
      channels: offer.channels,
    });
  } catch (error) {
    console.error("Internal offer lookup failed", error);
    return NextResponse.json({ error: "Offer lookup failed" }, { status: 500 });
  }
}
