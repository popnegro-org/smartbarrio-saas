"use client";

import { useState } from "react";

export function GoogleHoursSyncButton({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [manualText, setManualText] = useState("");

  async function sync() {
    setLoading(true); setMessage(""); setManualText("");
    try {
      const response = await fetch("/api/integrations/google/sync-hours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const result = await response.json() as { mode?: string; message?: string; text?: string };
      if (!response.ok) throw new Error(result.message ?? "No se pudo sincronizar");
      setMessage(result.message ?? "Operación completada");
      if (result.mode === "manual" && result.text) setManualText(result.text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error de sincronización");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(manualText);
    setMessage("Horarios copiados. Pegalos en Google Business Profile.");
  }

  return (
    <div className="mt-4 space-y-2">
      <button type="button" onClick={() => void sync()} disabled={loading}
        className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
        {loading ? "Sincronizando…" : "Sincronizar horarios con Google"}
      </button>
      {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
      {manualText && <div className="space-y-2"><textarea readOnly value={manualText} rows={3} className="w-full rounded-lg border p-2 text-sm" /><button type="button" onClick={() => void copy()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">Copiar horarios</button></div>}
    </div>
  );
}
