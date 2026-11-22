import { decryptToken, encryptToken, TOKEN_ENCRYPTION_KEY_VERSION } from "@/lib/security/token-crypto";
import { supabaseRequest } from "@/lib/supabase/rest";

type CredentialRow = { api_token_ciphertext: string; encryption_key_version: string };

export async function storeWhatsAppCredential(instanceId: string, apiToken: string) {
  await supabaseRequest("whatsapp_credentials?on_conflict=instance_id", {
    method: "POST",
    admin: true,
    prefer: "resolution=merge-duplicates,return=minimal",
    body: [{
      instance_id: instanceId,
      api_token_ciphertext: encryptToken(apiToken),
      encryption_key_version: TOKEN_ENCRYPTION_KEY_VERSION,
      updated_at: new Date().toISOString(),
    }],
  });
}

export async function readWhatsAppCredential(instanceId: string): Promise<string | null> {
  const rows = await supabaseRequest<CredentialRow[]>(
    "whatsapp_credentials?select=api_token_ciphertext,encryption_key_version&instance_id=eq." + instanceId + "&limit=1",
    { admin: true },
  );
  return rows[0] ? decryptToken(rows[0].api_token_ciphertext) : null;
}
