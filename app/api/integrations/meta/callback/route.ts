import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";
import { isTenantAdmin } from "@/lib/integrations/tenant-auth";
import { storeSocialCredentials } from "@/lib/integrations/social-credentials";
import { supabaseRequest } from "@/lib/supabase/rest";

type TokenResponse = { access_token: string; expires_in?: number };
type Page = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };
type PagesResponse = { data?: Page[] };
type IntegrationRow = { id: string };

function returnToDashboard(request: NextRequest, result: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  return NextResponse.redirect(new URL("/dashboard/integraciones?instagram=" + result, base));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state") ?? "");
  if (!code || !state || state.provider !== "instagram") return returnToDashboard(request, "error");

  try {
    if (!(await isTenantAdmin(state.userId, state.tenantId))) return returnToDashboard(request, "error");
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI;
    const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
    if (!appId || !appSecret || !redirectUri) return returnToDashboard(request, "error");

    const shortUrl = new URL("https://graph.facebook.com/" + version + "/oauth/access_token");
    shortUrl.searchParams.set("client_id", appId);
    shortUrl.searchParams.set("redirect_uri", redirectUri);
    shortUrl.searchParams.set("client_secret", appSecret);
    shortUrl.searchParams.set("code", code);
    const shortResponse = await fetch(shortUrl, { cache: "no-store" });
    if (!shortResponse.ok) throw new Error("Meta authorization code exchange failed");
    const shortToken = (await shortResponse.json()) as TokenResponse;

    const longUrl = new URL("https://graph.facebook.com/" + version + "/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken.access_token);
    const longResponse = await fetch(longUrl, { cache: "no-store" });
    if (!longResponse.ok) throw new Error("Meta long-lived token exchange failed");
    const longToken = (await longResponse.json()) as TokenResponse;

    const pagesUrl = new URL("https://graph.facebook.com/" + version + "/me/accounts");
    pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    pagesUrl.searchParams.set("access_token", longToken.access_token);
    const pagesResponse = await fetch(pagesUrl, { cache: "no-store" });
    if (!pagesResponse.ok) throw new Error("Meta pages lookup failed");
    const pages = ((await pagesResponse.json()) as PagesResponse).data ?? [];
    const page = pages.find((item) => item.instagram_business_account?.id);
    const instagram = page?.instagram_business_account;
    if (!page || !instagram) throw new Error("No Instagram professional account is connected to the selected Facebook pages");

    const subscriptionUrl = new URL("https://graph.facebook.com/" + version + "/" + page.id + "/subscribed_apps");
    subscriptionUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks");
    subscriptionUrl.searchParams.set("access_token", page.access_token);
    const subscriptionResponse = await fetch(subscriptionUrl, { method: "POST", cache: "no-store" });
    if (!subscriptionResponse.ok) throw new Error("Meta webhook subscription failed");

    const rows = await supabaseRequest<IntegrationRow[]>("social_integrations?on_conflict=tenant_id,provider&select=id", {
      method: "POST", admin: true, prefer: "resolution=merge-duplicates,return=representation",
      body: [{
        tenant_id: state.tenantId, provider: "instagram", status: "connected",
        external_account_id: instagram.id, account_name: instagram.username ?? page.name,
        scopes: ["instagram_basic", "instagram_manage_messages", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"],
        token_expires_at: longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000).toISOString() : null,
        last_error: null,
      }],
    });
    if (!rows[0]) throw new Error("Instagram integration record could not be saved");
    await storeSocialCredentials(rows[0].id, page.access_token, null);
    return returnToDashboard(request, "connected");
  } catch (error) {
    console.error("Meta OAuth callback failed", error);
    return returnToDashboard(request, "error");
  }
}
