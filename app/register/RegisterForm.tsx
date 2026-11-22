"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string; confirmationRequired?: boolean };
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear la cuenta");
      if (result.confirmationRequired) {
        setConfirmationRequired(true);
        return;
      }
      router.replace("/dashboard/onboarding");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error inesperado");
    } finally { setLoading(false); }
  }

  if (confirmationRequired) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">Revisá tu correo</h2>
        <p className="mt-2 text-sm text-gray-600">Te enviamos un enlace para confirmar la cuenta. Después vas a poder ingresar y configurar tu comercio.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-emerald-700 underline">Volver a ingresar</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      <label className="block text-sm font-medium">Correo electrónico
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium">Contraseña
        <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2.5" />
        <span className="mt-1 block text-xs font-normal text-gray-500">Mínimo 12 caracteres.</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Creando cuenta…" : "Crear cuenta"}</button>
    </form>
  );
}
