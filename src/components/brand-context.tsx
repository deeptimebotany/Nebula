"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { ACTIVE_BRAND_STORAGE_KEY, activeBrandFromCookie, rememberActiveBrand } from "@/lib/active-brand";

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  /** Logo de la marque (photo de sa Page bio), ou null → initiale. */
  logoUrl: string | null;
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

/**
 * Lot 10 : le layout de l'application (serveur) fournit la liste des marques
 * et la marque active (cookie) — plus d'appel /api/brands à attendre avant
 * de charger les données de la page, et le HTML arrive déjà avec la bonne
 * marque. Sans ces valeurs (tests, anciens appels), chargement comme avant.
 */
export function BrandProvider({
  children,
  initialBrands,
  initialActiveBrandId,
  activeFromCookie = false
}: {
  children: React.ReactNode;
  initialBrands?: BrandSummary[];
  initialActiveBrandId?: string | null;
  /** Vrai si le serveur a lu la marque dans le cookie (sinon : premier choix par défaut). */
  activeFromCookie?: boolean;
}) {
  const seeded = initialBrands !== undefined;
  const [brands, setBrands] = useState<BrandSummary[]>(initialBrands ?? []);
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(initialActiveBrandId ?? null);
  const [loading, setLoading] = useState(!seeded);

  const setActiveBrandId = useCallback((id: string) => {
    setActiveBrandIdState(id);
    rememberActiveBrand(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      const list: BrandSummary[] = data.brands ?? [];
      setBrands(list);
      setActiveBrandIdState((current) => {
        if (current && list.some((b) => b.id === current)) return current;
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(ACTIVE_BRAND_STORAGE_KEY);
        } catch {
          // stockage indisponible (mode privé, etc.) — on repart de la 1ère marque
        }
        const next = list.find((b) => b.id === stored)?.id ?? list[0]?.id ?? null;
        if (next) rememberActiveBrand(next);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!seeded) {
      void refresh();
      return;
    }
    // Marque choisie avant le lot 10 (localStorage seulement, pas encore de
    // cookie) : on la reprend une fois, puis le cookie suffit.
    if (!activeFromCookie) {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(ACTIVE_BRAND_STORAGE_KEY);
      } catch {
        stored = null;
      }
      const valid = (initialBrands ?? []).find((b) => b.id === stored);
      if (valid && valid.id !== initialActiveBrandId) {
        setActiveBrandId(valid.id);
        return;
      }
    }
    if (initialActiveBrandId && activeBrandFromCookie() !== initialActiveBrandId) rememberActiveBrand(initialActiveBrandId);
    // Une seule fois, au montage : les valeurs du serveur servent de départ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Valeur mémorisée : les composants qui lisent la marque active ne sont
  // re-rendus que si elle change réellement (audit performance, lot 4).
  const value = useMemo(
    () => ({ brands, activeBrand, setActiveBrandId, loading, refresh, createBrand, renameBrand, updateBrand }),
    [brands, activeBrand, setActiveBrandId, loading, refresh, createBrand, renameBrand, updateBrand]
  );

  return (
    <BrandContext.Provider value={value}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand doit être utilisé sous <BrandProvider>");
  return ctx;
}
