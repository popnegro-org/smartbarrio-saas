import { decryptToken, encryptToken, TOKEN_ENCRYPTION_KEY_VERSION } from "@/lib/security/token-crypto";
import { supabaseRequest } from "@/lib/supabase/rest";

type CredentialRow = {
  integration_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  encryption_key_version: string;
};

export async function storeSocialCredentials(
  integrationId: string,
  accessToken: string,
  refreshToken: string | null,
) {
  await supabaseRequest("social_credentials?on_conflict=integration_id", {
    method: "POST",
    admin: true,
    prefer: "resolution=merge-duplicates,return=minimal",
    body: [{
      integration_id: integrationId,
      access_token_ciphertext: encryptToken(accessToken, "social:" + integrationId + ":access"),
      refresh_token_ciphertext: refreshToken ? encryptToken(refreshToken, "social:" + integrationId + ":refresh") : null,
      encryption_key_version: TOKEN_ENCRYPTION_KEY_VERSION,
      updated_at: new Date().toISOString(),
    }],
  });
}

export async function readSocialCredentials(integrationId: string) {
  const rows = await supabaseRequest<CredentialRow[]>(
    "social_credentials?select=integration_id,access_token_ciphertext,refresh_token_ciphertext,encryption_key_version&integration_id=eq." +
      integrationId + "&limit=1",
    { admin: true },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: decryptToken(row.access_token_ciphertext, "social:" + integrationId + ":access"),
    refreshToken: row.refresh_token_ciphertext
      ? decryptToken(row.refresh_token_ciphertext, "social:" + integrationId + ":refresh")
      : null,
    keyVersion: row.encryption_key_version,
  };
}
