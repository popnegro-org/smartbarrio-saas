import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/rest";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Ingresá un correo válido y una contraseña de al menos 12 caracteres" }, { status: 400 });
    }

    const { url, publicKey } = getSupabaseConfig();
    const redirectTo = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "") + "/login";
    const response = await fetch(url + "/auth/v1/signup?redirect_to=" + encodeURIComponent(redirectTo), {
      method: "POST",
      headers: { apikey: publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { msg?: string; message?: string };
      const message = result.msg ?? result.message ?? "";
      const conflict = /already registered|already exists/i.test(message);
      return NextResponse.json({ error: conflict ? "Este correo ya está registrado" : "No se pudo crear la cuenta" }, { status: conflict ? 409 : 400 });
    }

    const session = (await response.json()) as {
      access_token?: string; refresh_token?: string; expires_in?: number;
      user?: { id: string; email?: string };
    };
    const result = NextResponse.json({
      success: true,
      confirmationRequired: !session.access_token,
      user: session.user ? { id: session.user.id, email: session.user.email } : null,
    }, { status: 201 });

    if (session.access_token && session.refresh_token) {
      const secure = process.env.NODE_ENV === "production";
      result.cookies.set("sb-access-token", session.access_token, {
        httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expires_in ?? 3600,
      });
      result.cookies.set("sb-refresh-token", session.refresh_token, {
        httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
      });
    }
    return result;
  } catch {
    return NextResponse.json({ error: "No se pudo crear la cuenta" }, { status: 500 });
  }
}
