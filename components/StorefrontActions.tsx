"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Minus, Plus } from "lucide-react";

export type StoreProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  kind: "product" | "service";
};

type Store = { id: string; name: string; whatsapp_number: string | null };

export function StorefrontActions({ tenant, products }: { tenant: Store; products: StoreProduct[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const totalItems = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);
  const total = useMemo(() => products.reduce((sum, p) => sum + (p.price ?? 0) * (cart[p.id] ?? 0), 0), [cart, products]);

  function update(id: string, delta: number) {
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[id] ?? 0) + delta;
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }

  function order() {
    if (!tenant.whatsapp_number || !totalItems) return;
    const lines = products.filter((p) => cart[p.id]).map((p) => {
      const qty = cart[p.id];
      const price = p.price === null ? "a consultar" : "$" + (p.price * qty).toLocaleString("es-AR");
      return qty + " x " + p.name + " — " + price;
    });
    const message = ["Hola " + tenant.name + ", quisiera consultar por este pedido:", ...lines, "Total estimado: $" + total.toLocaleString("es-AR")].join("\n");
    const number = tenant.whatsapp_number.replace(/\D/g, "");
    window.open("https://wa.me/" + number + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-xl border bg-white">
            {item.image_url && <img src={item.image_url} alt={item.name} loading="lazy" className="h-44 w-full object-cover" />}
            <div className="space-y-3 p-4">
              <span className="text-xs uppercase text-gray-500">{item.kind === "service" ? "Servicio" : "Producto"}</span>
              <h3 className="font-semibold">{item.name}</h3>
              {item.description && <p className="text-sm text-gray-600">{item.description}</p>}
              <p className="font-semibold">{item.price === null ? "Consultar precio" : item.price.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</p>
              <div className="flex items-center justify-between">
                <button type="button" aria-label={"Quitar " + item.name} onClick={() => update(item.id, -1)} className="rounded-lg border p-2"><Minus size={16} /></button>
                <span aria-live="polite">{cart[item.id] ?? 0}</span>
                <button type="button" aria-label={"Agregar " + item.name} onClick={() => update(item.id, 1)} className="rounded-lg border p-2"><Plus size={16} /></button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {products.length === 0 && <p className="rounded-xl border bg-white p-6 text-sm text-gray-600">Este comercio todavía no publicó productos ni servicios.</p>}
      {totalItems > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white p-4 shadow-lg">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div><p className="font-semibold">{totalItems} ítems</p><p className="text-sm text-gray-500">Total estimado: ${total.toLocaleString("es-AR")}</p></div>
            <button type="button" onClick={order} disabled={!tenant.whatsapp_number} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><MessageCircle size={18} /> Pedir por WhatsApp</button>
          </div>
        </div>
      )}
    </>
  );
}
