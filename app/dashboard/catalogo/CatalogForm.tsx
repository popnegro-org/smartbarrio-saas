"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CatalogForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [kind, setKind] = useState<"product" | "service">("product");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/products-services", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, name, description, price, kind }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo agregar");
      setName(""); setDescription(""); setPrice(""); setMessage("Elemento agregado."); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Agregar al catálogo</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Tipo
          <select value={kind} onChange={(e) => setKind(e.target.value as "product" | "service")} className="mt-1 w-full rounded-lg border px-3 py-2.5"><option value="product">Producto</option><option value="service">Servicio</option></select>
        </label>
        <label className="text-sm font-medium">Precio (ARS)
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
        </label>
      </div>
      <label className="block text-sm font-medium">Nombre
        <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium">Descripción
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
      <button disabled={loading} className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{loading ? "Guardando…" : "Agregar elemento"}</button>
    </form>
  );
}
