"use client";

import { createContext, useCallback, useContext } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";

interface StarfieldContextValue {
  enabled: boolean;
  allowed: boolean;
  loaded: boolean;
  setEnabled: (value: boolean) => Promise<boolean>;
  // Relit le bootstrap (/api/me) à la demande — voir settings/page.tsx, qui
  // l'appelle à chaque affichage : un compte qui vient de passer Pro/Agence
  // ne doit pas rester affiché comme verrouillé tant que l'onglet n'est pas
  // rechargé.
  refresh: () => void;
}

const StarfieldContext = createContext<StarfieldContextValue>({
  enabled: false,
  allowed: false,
  loaded: false,
  setEnabled: async () => false,
  refresh: () => undefined
});

export function useStarfield() {
  return useContext(StarfieldContext);
}

// Pas de copie en localStorage ici : le fond étoilé est un ajout décoratif
// par-dessus l'UI, pas la base visuelle de la page, et `allowed` (le palier)
// doit toujours être ce que le serveur vient de vérifier.
export function StarfieldProvider({ children }: { children: React.ReactNode }) {
  const { data, loaded, refresh, patch } = useBootstrap();
  const enabled = data?.starfield.enabled ?? false;
  const allowed = data?.starfield.allowed ?? false;

  const setEnabled = useCallback(
    async (value: boolean) => {
      const res = await fetch("/api/settings/starfield", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value })
      }).catch(() => null);
      if (!res || !res.ok) return false;
      patch({ starfield: { enabled: value, allowed } });
      return true;
    },
    [patch, allowed]
  );

  const doRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <StarfieldContext.Provider value={{ enabled, allowed, loaded, setEnabled, refresh: doRefresh }}>
      {children}
    </StarfieldContext.Provider>
  );
}
