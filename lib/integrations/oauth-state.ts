import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type OAuthProvider = "google_business" | "instagram";
export type OAuthState = {
  provider: OAuthProvider;
  tenantId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
};

function stateSecret() {
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTOMATION_SECRET must contain at least 32 characters");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

export function createOAuthState(input: Omit<OAuthState, "nonce" | "expiresAt">) {
  const payload: OAuthState = {
    ...input,
    nonce: randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + sign(encoded);
}

export function verifyOAuthState(value: string): OAuthState | null {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
    if (payload.expiresAt < Date.now() || !payload.tenantId || !payload.userId ||
        !["google_business", "instagram"].includes(payload.provider)) return null;
    return payload;
  } catch {
    return null;
  }
}
