import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { isTenantAdmin } from "@/lib/integrations/tenant-auth";
import { storeSocialCredentials } from "@/lib/integrations/social-credentials";
import { supabaseRequest } from "@/lib/supabase/rest";

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
type AccountsResponse = { accounts?: Array<{ name: string; accountName?: string }> };
type LocationsResponse = { locations?: Array<{ name: string; title?: string }> };
type IntegrationRow = { id: string };

function returnToDashboard(request: NextRequest, result: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  return NextResponse.redirect(new URL("/dashboard/integraciones?google=" + result, base));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state") ?? "");
  if (!code || !state || state.provider !== "google_business") return returnToDashboard(request, "error");

  try {
    if (!(await isTenantAdmin(state.userId, state.tenantId))) return returnToDashboard(request, "error");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return returnToDashboard(request, "error");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokens = (await tokenResponse.json()) as TokenResponse;

    const accountsResponse = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: "Bearer " + tokens.access_token },
      cache: "no-store",
    });
    if (!accountsResponse.ok) throw new Error("Google Business account lookup failed");
    const accounts = ((await accountsResponse.json()) as AccountsResponse).accounts ?? [];

    let location: { name: string; title?: string } | null = null;
    let accountLabel = "";
    let accountResource = "";
    for (const account of accounts) {
      const locationsResponse = await fetch(
        "https://mybusinessbusinessinformation.googleapis.com/v1/" + account.name + "/locations?readMask=name,title&pageSize=100",
        { headers: { Authorization: "Bearer " + tokens.access_token }, cache: "no-store" },
      );
      if (!locationsResponse.ok) continue;
      const locations = ((await locationsResponse.json()) as LocationsResponse).locations ?? [];
      if (locations[0]) {
        location = locations[0];
        accountLabel = account.accountName ?? account.name;
        accountResource = account.name;
        break;
      }
    }
    if (!location) throw new Error("No Google Business location available for this account");

    const rows = await supabaseRequest<IntegrationRow[]>("social_integrations?on_conflict=tenant_id,provider&select=id", {
      method: "POST", admin: true, prefer: "resolution=merge-duplicates,return=representation",
      body: [{
        tenant_id: state.tenantId, provider: "google_business", status: "connected",
        external_account_id: accountResource + "/" + location.name, account_name: location.title ?? accountLabel,
        scopes: (tokens.scope ?? "https://www.googleapis.com/auth/business.manage").split(" "),
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        last_error: null,
      }],
    });
    if (!rows[0]) throw new Error("Google integration record could not be saved");
    await storeSocialCredentials(rows[0].id, tokens.access_token, tokens.refresh_token ?? null);
    return returnToDashboard(request, "connected");
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return returnToDashboard(request, "error");
  }
}
