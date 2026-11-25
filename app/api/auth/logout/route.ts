import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/rest";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (token) {
    const { url, publicKey } = getSupabaseConfig();
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");
  return response;
}
