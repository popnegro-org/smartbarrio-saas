import { cookies } from "next/headers";

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string;
  admin?: boolean;
  body?: unknown;
  prefer?: string;
  headers?: Record<string, string>;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey) throw new Error("Supabase public configuration is missing");
  return { url: url.replace(/\/$/, ""), publicKey };
}

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SupabaseRequestError";
  }
}

export async function supabaseRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { url, publicKey } = config();
  const adminKey = options.admin ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined;
  if (options.admin && !adminKey) throw new Error("Supabase service role key is missing");

  const apiKey = adminKey ?? publicKey;
  const bearer = options.admin ? adminKey! : options.token ?? publicKey;
  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${bearer}`,
    Accept: "application/json",
    ...options.headers,
  };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.prefer) headers.Prefer = options.prefer;

  const response = await fetch(`${url}/rest/v1/${path.replace(/^\//, "")}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new SupabaseRequestError(
      `Supabase request failed with status ${response.status}: ${text.slice(0, 500)}`,
      response.status,
    );
  }
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

export async function getSupabaseUser(token: string): Promise<SupabaseUser | null> {
  const { url, publicKey } = config();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as SupabaseUser;
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get("sb-access-token")?.value ?? null;
}

export async function getCurrentSession(): Promise<{
  user: SupabaseUser | null;
  accessToken: string | null;
}> {
  const accessToken = await getAccessToken();
  if (!accessToken) return { user: null, accessToken: null };
  const user = await getSupabaseUser(accessToken);
  return { user, accessToken: user ? accessToken : null };
}

export function getSupabaseConfig() {
  return config();
}
