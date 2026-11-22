import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-2xl font-bold">SmartBarrio</Link>
        <h1 className="mb-2 text-center text-2xl font-bold">Ingresar al comercio</h1>
        <p className="mb-6 text-center text-sm text-gray-600">Administrá tu página, catálogo y ofertas.</p>
        <Suspense fallback={<div className="rounded-xl border bg-white p-6">Cargando formulario…</div>}>
          <LoginForm />
        <p className="mt-5 text-center text-sm text-gray-600">¿No tenés cuenta? <Link href="/register" className="font-medium text-emerald-700 underline">Crear cuenta</Link></p>
        </Suspense>
      </div>
    </main>
  );
}
