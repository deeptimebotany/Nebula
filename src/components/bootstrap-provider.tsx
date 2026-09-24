"use client";

// Chargement UNIQUE, au démarrage de l'application connectée, de tout ce que
// le shell et les préférences d'apparence ont besoin de savoir (voir
// /api/me). Les fournisseurs Thème / Fond / Mode / Thème étoilé /
// Cosmétiques lisent ici au lieu de lancer chacun leur propre requête, et le
// shell (barre latérale, en-tête) y lit le palier, la marque blanche et le
// Mode focus. `refresh()` relit tout (après un changement de palier, une
// création de marque…) ; `patch()` met à jour localement sans attendre le
// serveur (après un PATCH réussi sur un réglage).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse } from "@/lib/me-types";

export type BootstrapData = MeResponse;

interface BootstrapContextValue {
  data: BootstrapData | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  patch: (partial: Partial<BootstrapData>) => void;
  setFocusMode: (value: boolean) => Promise<boolean>;
}

const BootstrapContext = createContext<BootstrapContextValue>({
  data: null,
  loaded: false,
  refresh: async () => undefined,
  patch: () => undefined,
  setFocusMode: async () => false
});

export function useBootstrap() {
  return useContext(BootstrapContext);
}

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    // Une seule requête à la fois : si plusieurs composants demandent un
    // rafraîchissement au même moment, ils partagent la même réponse.
    if (inflight.current) return inflight.current;
    const p = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<BootstrapData>) : null))
      .then((d) => {
        if (d) setData(d);
      })
      .catch(() => undefined)
      .finally(() => {
        setLoaded(true);
        inflight.current = null;
      });
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patch = useCallback((partial: Partial<BootstrapData>) => {
    setData((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  // Nouvel easter egg trouvé (événement « nebula:achievement », émis une
  // seule fois par découverte — voir report-easter-egg.ts) : le compteur
  // « Succès » du menu avance tout de suite, sans recharger /api/me.
  useEffect(() => {
    function onAchievement() {
      setData((prev) => (prev?.eggs ? { ...prev, eggs: { ...prev.eggs, found: Math.min(prev.eggs.total, prev.eggs.found + 1) } } : prev));
    }
    window.addEventListener("nebula:achievement", onAchievement);
    return () => window.removeEventListener("nebula:achievement", onAchievement);
  }, []);

  // Réussite fêtée à l'écran (accomplissement, défi, niveau) : niveau et
  // compteur du menu relus depuis /api/me.
  useEffect(() => {
    function onReussite() {
      refresh();
    }
    window.addEventListener("nebula:reussite", onReussite);
    return () => window.removeEventListener("nebula:reussite", onReussite);
  }, [refresh]);

  const setFocusMode = useCallback(
    async (value: boolean) => {
      const res = await fetch("/api/settings/focus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusMode: value })
      }).catch(() => null);
      if (!res || !res.ok) return false;
      patch({ focusMode: value });
      return true;
    },
    [patch]
  );

  const value = useMemo(() => ({ data, loaded, refresh, patch, setFocusMode }), [data, loaded, refresh, patch, setFocusMode]);
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

/** Mode focus : vrai tant que le bootstrap n'a pas répondu (défaut du produit). */
export function useFocusMode(): { focusMode: boolean; loaded: boolean; setFocusMode: (v: boolean) => Promise<boolean> } {
  const { data, loaded, setFocusMode } = useBootstrap();
  return { focusMode: data?.focusMode ?? true, loaded, setFocusMode };
}
