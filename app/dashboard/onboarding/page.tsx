import { OnboardingForm } from "./OnboardingForm";

export default function OnboardingPage() {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Primer paso · 2 minutos</p>
      <h1 className="mt-2 text-2xl font-bold">Configurá tu comercio</h1>
      <p className="mt-2 text-sm text-gray-600">Elegí el nombre, la dirección de tu página y el rubro. Podés completar el resto después.</p>
      <OnboardingForm />
    </section>
  );
}
