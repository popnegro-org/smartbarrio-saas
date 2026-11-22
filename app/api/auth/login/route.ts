import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/rest";
import { isValidEmailAddress } from "@/lib/security/email-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!isValidEmailAddress(email) || password.length < 8) {
      return NextResponse.json({ error: "Email o contraseña inválidos" }, { status: 400 });
    }

    const { url, publicKey } = getSupabaseConfig();
    const authResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    if (!authResponse.ok) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const session = (await authResponse.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: { id: string; email?: string };
    };

    const response = NextResponse.json({
      user: { id: session.user.id, email: session.user.email },
    });
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set("sb-access-token", session.access_token, {
      httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expires_in,
    });
    response.cookies.set("sb-refresh-token", session.refresh_token, {
      httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "No se pudo iniciar sesión" }, { status: 500 });
  }
}
