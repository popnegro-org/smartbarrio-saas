"use client";

import { useEffect, useState } from "react";

type Connection = { status?: string; instanceName?: string; qr?: string | null; phoneNumber?: string | null; error?: string };

export function WhatsAppConnection({ tenantId, initialStatus }: { tenantId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const response = await fetch("/api/integrations/evolution/instance?tenantId=" + encodeURIComponent(tenantId), { cache: "no-store" });
    const result = (await response.json()) as Connection;
    if (!response.ok) throw new Error(result.error ?? "No se pudo consultar WhatsApp");
    setStatus(result.status ?? "disconnected");
    setQr(result.qr ?? null);
    setPhone(result.phoneNumber ?? null);
  }

  async function connect() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/evolution/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const result = (await response.json()) as Connection;
      if (!response.ok) throw new Error(result.error ?? "No se pudo iniciar la conexión");
      setStatus(result.status ?? "qr_pending");
      setQr(result.qr ?? null);
      setPhone(result.phoneNumber ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!["qr_pending", "connecting", "creating"].includes(status)) return;
    const timer = window.setInterval(() => {
      refresh().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar el estado");
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [status, tenantId]);

  const imageSrc = qr ? (qr.startsWith("data:") ? qr : "data:image/png;base64," + qr) : null;

  return (
    <section className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">WhatsApp conectado</h2>
          <p className="mt-1 text-sm text-gray-600">Conectá el número del comercio para publicar ofertas y responder consultas.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">{status === "connected" ? "Conectado" : status === "qr_pending" ? "Esperando QR" : status}</span>
      </div>

      {status === "connected" ? (
        <p className="mt-4 text-sm text-emerald-700">Número conectado: {phone ?? "WhatsApp"}</p>
      ) : imageSrc ? (
        <div className="mt-5 flex flex-col items-center gap-3">
          <img src={imageSrc} alt="Código QR temporal para conectar WhatsApp" className="h-64 w-64 rounded-lg border bg-white p-2" />
          <p className="text-sm text-gray-600">WhatsApp → Dispositivos vinculados → Vincular un dispositivo.</p>
        </div>
      ) : (
        <button type="button" onClick={connect} disabled={loading} className="mt-5 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? "Preparando conexión…" : "Conectar WhatsApp con QR"}
        </button>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
