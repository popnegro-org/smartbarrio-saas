import { NextRequest, NextResponse } from "next/server";

function unavailable() {
  return NextResponse.json(
    { error: "Authentication service temporarily unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Protected routes must fail closed when authentication is not configured.
  if (!url || !key) return unavailable();

  const baseUrl = url.replace(/\/$/, "");
  const accessToken = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;

  try {
    if (accessToken) {
      const check = await fetch(`${baseUrl}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (check.ok) return NextResponse.next();
    }

    if (!refreshToken) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(login);
    }

    const refresh = await fetch(
      `${baseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      },
    );

    if (!refresh.ok) {
      const login = NextResponse.redirect(new URL("/login", request.url));
      login.cookies.delete("sb-access-token");
      login.cookies.delete("sb-refresh-token");
      return login;
    }

    const session = (await refresh.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    if (!session.access_token || !session.refresh_token || !Number.isFinite(session.expires_in)) {
      return unavailable();
    }

    request.cookies.set("sb-access-token", session.access_token);
    request.cookies.set("sb-refresh-token", session.refresh_token);
    const response = NextResponse.next({ request });
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set("sb-access-token", session.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: session.expires_in,
    });
    response.cookies.set("sb-refresh-token", session.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    // Network failures must not turn a protected route into an unauthenticated pass-through.
    return unavailable();
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
