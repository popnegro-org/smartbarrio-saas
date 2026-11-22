import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { requireTenantAdmin } from "@/lib/integrations/tenant-auth";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return NextResponse.json({ error: "Tenant inválido" }, { status: 400 });
  const auth = await requireTenantAdmin(request, tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return NextResponse.json({ error: "Google OAuth no está configurado" }, { status: 503 });

  const state = createOAuthState({ provider: "google_business", tenantId, userId: auth.user.id });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/business.manage");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
