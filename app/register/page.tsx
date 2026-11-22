import Link from "next/link";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-2xl font-bold">SmartBarrio</Link>
        <h1 className="mb-2 text-center text-2xl font-bold">Crear cuenta</h1>
        <p className="mb-6 text-center text-sm text-gray-600">Empezá a configurar la presencia digital de tu comercio.</p>
        <RegisterForm />
        <p className="mt-5 text-center text-sm text-gray-600">¿Ya tenés cuenta? <Link href="/login" className="font-medium text-emerald-700 underline">Ingresar</Link></p>
      </div>
    </main>
  );
}
