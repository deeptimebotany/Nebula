"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface CosmeticsContextValue {
  enabled: Set<string>;
  allowedKeys: Set<string>;
  loaded: boolean;
  has: (key: string) => boolean;
  setEnabled: (key: string, value: boolean) => Promise<boolean>;
  refresh: () => void;
}

const CosmeticsContext = createContext<CosmeticsContextValue>({
  enabled: new Set(),
  allowedKeys: new Set(),
  loaded: false,
  has: () => false,
  setEnabled: async () => false,
  refresh: () => undefined
});

export function useCosmetics() {
  return useContext(CosmeticsContext);
}

// Même schéma que StarfieldProvider (voir ce fichier) : pas de copie en
// localStorage — chaque cosmétique dépend du palier ET d'un choix explicite
// enregistré côté serveur, jamais d'une valeur mise en cache côté client.
export function CosmeticsProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState<Set<string>>(new Set());
  const [allowedKeys, setAllowedKeys] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/settings/cosmetics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEnabledState(new Set(d.enabled ?? []));
          setAllowedKeys(new Set(d.allowedKeys ?? []));
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEnabled = useCallback(async (key: string, value: boolean) => {
    const res = await fetch("/api/settings/cosmetics", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled: value })
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setEnabledState((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
    return true;
  }, []);

  const has = useCallback((key: string) => enabled.has(key), [enabled]);

  return (
    <CosmeticsContext.Provider value={{ enabled, allowedKeys, loaded, has, setEnabled, refresh }}>
      {children}
    </CosmeticsContext.Provider>
  );
}
