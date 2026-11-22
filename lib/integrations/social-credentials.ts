import { decryptToken, encryptToken, TOKEN_ENCRYPTION_KEY_VERSION } from "@/lib/security/token-crypto";
import { supabaseRequest } from "@/lib/supabase/rest";

type CredentialRow = {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  encryption_key_version: string;
};

export async function storeSocialCredentials(
  integrationId: string,
  accessToken: string,
  refreshToken: string | null,
) {
  await supabaseRequest("rpc/store_social_credentials", {
    method: "POST",
    admin: true,
    body: {
      p_integration_id: integrationId,
      p_access_token_ciphertext: encryptToken(accessToken),
      p_refresh_token_ciphertext: refreshToken ? encryptToken(refreshToken) : null,
      p_encryption_key_version: TOKEN_ENCRYPTION_KEY_VERSION,
    },
  });
}

export async function readSocialCredentials(integrationId: string) {
  const rows = await supabaseRequest<CredentialRow[]>("rpc/read_social_credentials", {
    method: "POST",
    admin: true,
    body: { p_integration_id: integrationId },
  });
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: decryptToken(row.access_token_ciphertext),
    refreshToken: row.refresh_token_ciphertext ? decryptToken(row.refresh_token_ciphertext) : null,
    keyVersion: row.encryption_key_version,
  };
}
