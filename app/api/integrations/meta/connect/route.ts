import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { requireTenantAdmin } from "@/lib/integrations/tenant-auth";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
  const auth = await requireTenantAdmin(request, tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;
  const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
  if (!appId || !redirectUri) return NextResponse.json({ error: "Meta OAuth no está configurado" }, { status: 503 });

  const state = createOAuthState({ provider: "instagram", tenantId, userId: auth.user.id });
  const url = new URL("https://www.facebook.com/" + version + "/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
