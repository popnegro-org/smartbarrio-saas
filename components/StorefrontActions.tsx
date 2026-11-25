"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Minus, Plus, Bell } from "lucide-react";

type OneSignalSdk = {
  init(options: { appId: string; notifyButton?: { enable: boolean } }): Promise<void>;
  User: { addTag(key: string, value: string): Promise<void>; PushSubscription: { id: string | null } };
  Slidedown: { promptPush(): Promise<void> };
};

declare global {
  interface Window { OneSignalDeferred?: Array<(sdk: OneSignalSdk) => Promise<void> | void>; }
}

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
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [showIosGuide, setShowIosGuide] = useState(false);
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

  async function subscribePush() {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) { setPushMessage("Las notificaciones todavía no están configuradas."); return; }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushMessage("Este navegador no admite notificaciones web."); return;
    }
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (ios && !installed) {
      setShowIosGuide(true);
      setPushMessage("Primero instalá la página en la pantalla de inicio.");
      return;
    }
    setPushLoading(true);
    setPushMessage("");
    const queue = window.OneSignalDeferred;
    if (!queue) { setPushLoading(false); setPushMessage("No se pudo inicializar el servicio de notificaciones."); return; }
    queue.push(async (OneSignal) => {
      try {
        await OneSignal.init({ appId, notifyButton: { enable: false } });
        await OneSignal.User.addTag("tenant_id", tenant.id);
        await OneSignal.Slidedown.promptPush();
        const subscriptionId = OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: tenant.id, subscriptionId }),
          });
        }
        setPushMessage("Preferencias de notificaciones actualizadas.");
      } catch {
        setPushMessage("No se pudo activar la suscripción.");
      } finally { setPushLoading(false); }
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
      <section className="mt-10 rounded-xl border bg-white p-5">
        <div className="flex items-start gap-3">
          <Bell size={22} className="mt-1 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Recibí ofertas de {tenant.name}</h2>
            <p className="mt-1 text-sm text-gray-600">Activá las notificaciones para enterarte de promociones y novedades.</p>
            <button type="button" disabled={pushLoading} onClick={subscribePush} className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
              {pushLoading ? "Activando…" : "Activar notificaciones"}
            </button>
            {pushMessage && <p role="status" className="mt-2 text-sm text-gray-600">{pushMessage}</p>}
            <button type="button" onClick={() => setShowIosGuide(true)} className="mt-3 text-sm font-medium text-emerald-700 underline">
              Instrucciones para iPhone y iPad
            </button>
          </div>
        </div>
      </section>
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="ios-pwa-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="ios-pwa-title" className="text-lg font-semibold">Agregar el comercio a inicio</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-gray-700">
              <li>Abrí esta página en Safari desde tu iPhone o iPad.</li>
              <li>Tocá el botón Compartir.</li>
              <li>Elegí Agregar a pantalla de inicio y confirmá.</li>
              <li>Abrí el comercio desde el nuevo icono.</li>
              <li>Volvé a tocar Activar notificaciones y aceptá el permiso.</li>
            </ol>
            <button type="button" onClick={() => setShowIosGuide(false)} className="mt-6 w-full rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white">
              Entendido
            </button>
          </section>
        </div>
      )}
    </>
  );
}
