import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig, getSupabaseUser, supabaseRequest } from "@/lib/supabase/rest";

type Membership = { role: string };

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("sb-access-token")?.value;
  if (!token || !(await getSupabaseUser(token))) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const tenantId = String(form.get("tenantId") ?? "");
    const file = form.get("file");
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !(file instanceof File)) {
      return NextResponse.json({ error: "Archivo o comercio inválido" }, { status: 400 });
    }
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension || file.size < 1 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Usá PNG, JPG o WebP de hasta 5 MB" }, { status: 400 });
    }

    const memberships = await supabaseRequest<Membership[]>(
      "tenant_members?select=role&tenant_id=eq." + tenantId + "&limit=1",
      { token },
    );
    if (!memberships[0] || !["owner", "admin"].includes(memberships[0].role)) {
      return NextResponse.json({ error: "Sin permisos para subir archivos a este comercio" }, { status: 403 });
    }

    const { url, publicKey } = getSupabaseConfig();
    const objectPath = tenantId + "/" + randomUUID() + "." + extension;
    const uploadResponse = await fetch(
      url + "/storage/v1/object/tenant-assets/" + objectPath,
      {
        method: "POST",
        headers: {
          apikey: publicKey,
          Authorization: "Bearer " + token,
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: await file.arrayBuffer(),
        cache: "no-store",
      },
    );
    if (!uploadResponse.ok) {
      console.error("Supabase Storage upload failed", uploadResponse.status, (await uploadResponse.text()).slice(0, 300));
      return NextResponse.json({ error: "No se pudo guardar la imagen" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      path: objectPath,
      publicUrl: url + "/storage/v1/object/public/tenant-assets/" + objectPath,
    }, { status: 201 });
  } catch (error) {
    console.error("Storage upload failed", error);
    return NextResponse.json({ error: "No se pudo subir la imagen" }, { status: 400 });
  }
}
