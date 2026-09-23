"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  /** Fuseau horaire de programmation (voir src/lib/timezone.ts). */
  timezone: string;
  role: string;
  connectionsCount: number;
}

interface BrandContextValue {
  brands: BrandSummary[];
  activeBrand: BrandSummary | null;
  setActiveBrandId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  createBrand: (name: string) => Promise<{ ok: boolean; error?: string; reason?: string; status?: number }>;
  renameBrand: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  updateBrand: (id: string, patch: { name?: string; timezone?: string }) => Promise<{ ok: boolean; error?: string }>;
}

const BrandContext = createContext<BrandContextValue | null>(null);
const STORAGE_KEY = "nebula:activeBrandId";

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      const list: BrandSummary[] = data.brands ?? [];
      setBrands(list);

      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        // stockage indisponible (mode privé, etc.) — on repart de la 1ère marque
      }
      const valid = list.find((b) => b.id === stored);
      setActiveBrandIdState(valid?.id ?? list[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveBrandId = useCallback((id: string) => {
    setActiveBrandIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? null;

  const createBrand = useCallback(
    async (name: string) => {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? "Erreur lors de la création de la marque.", reason: data.reason, status: res.status };
      await refresh();
      if (data.brand?.id) setActiveBrandId(data.brand.id);
      return { ok: true };
    },
    [refresh, setActiveBrandId]
  );

  const updateBrand = useCallback(
    async (id: string, patch: { name?: string; timezone?: string }) => {
      const res = await fetch(`/api/brands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? "Erreur lors de l'enregistrement." };
      await refresh();
      return { ok: true };
    },
    [refresh]
  );

  const renameBrand = useCallback((id: string, name: string) => updateBrand(id, { name }), [updateBrand]);

  return (
    <BrandContext.Provider value={{ brands, activeBrand, setActiveBrandId, loading, refresh, createBrand, renameBrand, updateBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand doit être utilisé sous <BrandProvider>");
  return ctx;
}
