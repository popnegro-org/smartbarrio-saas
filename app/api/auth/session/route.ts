import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUser } from "@/lib/supabase/rest";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token) return NextResponse.json({ user: null }, { status: 401 });
  const user = await getSupabaseUser(token);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
