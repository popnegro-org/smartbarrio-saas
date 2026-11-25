import { readSocialCredentials, storeSocialCredentials } from "@/lib/integrations/social-credentials";
import { supabaseRequest } from "@/lib/supabase/rest";

type Integration = { id: string; token_expires_at: string | null };

export async function getGoogleAccessToken(integration: Integration): Promise<string> {
  const credentials = await readSocialCredentials(integration.id);
  if (!credentials) throw new Error("Google credentials are unavailable");

  const expiresAt = integration.token_expires_at ? Date.parse(integration.token_expires_at) : 0;
  if (expiresAt > Date.now() + 60_000) return credentials.accessToken;
  if (!credentials.refreshToken) throw new Error("Google refresh token is unavailable");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google token refresh failed");
  const tokens = await response.json() as { access_token: string; expires_in: number; refresh_token?: string };
  await storeSocialCredentials(integration.id, tokens.access_token, tokens.refresh_token ?? credentials.refreshToken);
  await supabaseRequest("social_integrations?id=eq." + integration.id, {
    method: "PATCH",
    admin: true,
    prefer: "return=minimal",
    body: { token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString() },
  });
  return tokens.access_token;
}
