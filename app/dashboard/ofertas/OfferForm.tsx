"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OfferForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [push, setPush] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [google, setGoogle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId, title, description, offerPrice: price ? Number(price) : undefined,
          channels: { push, whatsapp, google, instagram: false },
        }),
      });
      const result = (await response.json()) as { error?: string; automationPending?: boolean };
      if (!response.ok) throw new Error(result.error ?? "No se pudo publicar");
      setMessage(result.automationPending ? "Oferta guardada. Hay canales pendientes de configuración." : "Oferta publicada.");
      setTitle(""); setDescription(""); setPrice("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border bg-white p-5">
      <label className="block text-sm font-medium">Título
        <input required minLength={3} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium">Descripción
        <textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium">Precio promocional (ARS)
        <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Canales de publicación</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Notificaciones push</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> Estado de WhatsApp conectado</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={google} onChange={(e) => setGoogle(e.target.checked)} /> Google Business Profile</label>
      </fieldset>
      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
      <button disabled={loading} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
        {loading ? "Publicando…" : "Guardar y publicar oferta"}
      </button>
    </form>
  );
}
