"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tenant = {
  id: string; name: string; description: string | null; phone: string | null; whatsapp_number: string | null;
  address: string | null; city: string | null; province: string | null; instagram_url: string | null;
  google_review_url: string | null; logo_url: string | null; is_published: boolean;
};

export function CommerceForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: tenant.name, description: tenant.description ?? "", phone: tenant.phone ?? "",
    whatsapp_number: tenant.whatsapp_number ?? "", address: tenant.address ?? "",
    city: tenant.city ?? "", province: tenant.province ?? "Mendoza",
    instagram_url: tenant.instagram_url ?? "", google_review_url: tenant.google_review_url ?? "",
    logo_url: tenant.logo_url ?? "", is_published: tenant.is_published,
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function field(key: keyof typeof values, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setMessage("");
    try {
      const data = new FormData();
      data.append("tenantId", tenant.id);
      data.append("file", file);
      const response = await fetch("/api/storage/upload", { method: "POST", body: data });
      const result = (await response.json()) as { publicUrl?: string; error?: string };
      if (!response.ok || !result.publicUrl) throw new Error(result.error ?? "No se pudo subir el logo");
      field("logo_url", result.publicUrl);
      setMessage("Logo cargado. Guardá los cambios para publicarlo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al subir el logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/tenants/" + tenant.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar");
      setMessage("Datos guardados.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally { setLoading(false); }
  }

  const textFields: Array<[keyof typeof values, string]> = [
    ["name", "Nombre comercial"], ["phone", "Teléfono"], ["whatsapp_number", "WhatsApp con código de país"],
    ["address", "Dirección"], ["city", "Ciudad"], ["province", "Provincia"],
    ["instagram_url", "URL de Instagram"], ["google_review_url", "URL de reseñas de Google"],
  ];

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-xl border bg-white p-5">
      {textFields.map(([key, label]) => (
        <label key={key} className="block text-sm font-medium">{label}
          <input value={String(values[key])} onChange={(e) => field(key, e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
        </label>
      ))}
      <label className="block text-sm font-medium">Descripción
        <textarea rows={4} value={values.description} onChange={(e) => field("description", e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.is_published} onChange={(e) => field("is_published", e.target.checked)} /> Publicar página</label>
      <label className="block text-sm font-medium">Logo del comercio
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingLogo} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadLogo(file); }} className="mt-1 block w-full text-sm" />
        <span className="mt-1 block text-xs font-normal text-gray-500">PNG, JPG o WebP · máximo 5 MB.</span>
      </label>
      {values.logo_url && <img src={values.logo_url} alt="Vista previa del logo" className="h-20 w-20 rounded-xl border object-cover" />}
      {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
      <button disabled={loading} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  );
}
