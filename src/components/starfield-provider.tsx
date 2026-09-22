"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface StarfieldContextValue {
  enabled: boolean;
  allowed: boolean;
  loaded: boolean;
  setEnabled: (value: boolean) => Promise<boolean>;
  // Relit /api/settings/starfield à la demande (voir settings/page.tsx, qui
  // l'appelle à chaque fois qu'on affiche la page) — la vérification
  // initiale ne se fait qu'une fois au montage de <Providers>, tout en haut
  // de l'appli, donc sans ça un compte qui vient de passer Pro/Agence
  // resterait affiché comme verrouillé tant que l'onglet n'est pas rechargé.
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

// Même schéma général que ThemeProvider/BackgroundProvider (voir ces
// fichiers), en plus simple : pas de copie en localStorage ici, car ce n'est
// pas nécessaire pour éviter un flash (le fond étoilé est un ajout décoratif
// par-dessus l'UI, pas la base visuelle de la page) — et ça garantit que
// `allowed` (le palier) est toujours celui que le serveur vient de vérifier,
// jamais une valeur mise en cache côté client.
export function StarfieldProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    // `cache: "no-store"` : évite qu'une réponse mise en cache par le
    // navigateur (ou un intermédiaire) ne serve une ancienne valeur de
    // `allowed` après un changement de palier.
    fetch("/api/settings/starfield", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEnabledState(Boolean(d.enabled));
          setAllowed(Boolean(d.allowed));
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    const res = await fetch("/api/settings/starfield", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: value })
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setEnabledState(value);
    return true;
  }, []);

  return (
    <StarfieldContext.Provider value={{ enabled, allowed, loaded, setEnabled, refresh }}>
      {children}
    </StarfieldContext.Provider>
  );
}
