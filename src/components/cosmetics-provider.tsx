"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";

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

// Même schéma que StarfieldProvider : valeurs lues dans le bootstrap /api/me
// (palier ET choix explicite enregistrés côté serveur), jamais mises en
// cache côté client.
export function CosmeticsProvider({ children }: { children: React.ReactNode }) {
  const { data, loaded, refresh, patch } = useBootstrap();
  const enabledList = data?.cosmetics.enabled;
  const allowedList = data?.cosmetics.allowedKeys;
  const enabled = useMemo(() => new Set(enabledList ?? []), [enabledList]);
  const allowedKeys = useMemo(() => new Set(allowedList ?? []), [allowedList]);

  const setEnabled = useCallback(
    async (key: string, value: boolean) => {
      const res = await fetch("/api/settings/cosmetics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled: value })
      }).catch(() => null);
      if (!res || !res.ok) return false;
      const next = new Set(enabledList ?? []);
      if (value) next.add(key);
      else next.delete(key);
      patch({ cosmetics: { enabled: Array.from(next), allowedKeys: allowedList ?? [] } });
      return true;
    },
    [patch, enabledList, allowedList]
  );

  const has = useCallback((key: string) => enabled.has(key), [enabled]);
  const doRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <CosmeticsContext.Provider value={{ enabled, allowedKeys, loaded, has, setEnabled, refresh: doRefresh }}>
      {children}
    </CosmeticsContext.Provider>
  );
}
