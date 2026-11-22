"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [businessType, setBusinessType] = useState("almacen");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateName(value: string) {
    setName(value);
    setSlug(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, businessType }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear el comercio");
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-xl space-y-4">
      <label className="block text-sm font-medium">Nombre comercial
        <input required minLength={2} maxLength={120} value={name} onChange={(event) => updateName(event.target.value)}
          className="mt-1 w-full rounded-lg border bg-white px-3 py-3" />
      </label>
      <label className="block text-sm font-medium">Dirección de tu página
        <div className="mt-1 flex items-center rounded-lg border bg-white px-3">
          <span className="text-gray-400">/</span>
          <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)}
            className="min-w-0 flex-1 border-0 px-2 py-3 outline-none" />
        </div>
      </label>
      <label className="block text-sm font-medium">Rubro
        <select value={businessType} onChange={(event) => setBusinessType(event.target.value)}
          className="mt-1 w-full rounded-lg border bg-white px-3 py-3">
          <option value="almacen">Almacén / kiosco</option>
          <option value="rotiseria">Rotisería</option>
          <option value="peluqueria">Peluquería</option>
          <option value="ferreteria">Ferretería</option>
          <option value="otro">Otro comercio</option>
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={loading} className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
        {loading ? "Creando…" : "Crear y activar comercio"}
      </button>
    </form>
  );
}
