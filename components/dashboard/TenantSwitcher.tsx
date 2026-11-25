"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tenant = { id: string; name: string };

export function TenantSwitcher({ tenants, activeTenantId }: { tenants: Tenant[]; activeTenantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  if (tenants.length < 2) return null;

  async function change(tenantId: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/tenants/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!response.ok) throw new Error("No se pudo cambiar el comercio");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="mb-4 block text-xs font-medium text-gray-500">
      Comercio activo
      <select disabled={loading} value={activeTenantId} onChange={(event) => void change(event.target.value)}
        className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm text-gray-900 disabled:opacity-50">
        {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
      </select>
    </label>
  );
}
