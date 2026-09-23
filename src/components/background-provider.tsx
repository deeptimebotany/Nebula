"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_BACKGROUND_KEY, findBackground } from "@/lib/backgrounds";
import { useBootstrap } from "@/components/bootstrap-provider";

const STORAGE_KEY = "nebula:background";

function applyBackground(key: string) {
  const bg = findBackground(key);
  document.documentElement.style.setProperty("--app-bg", bg.css);
  document.documentElement.dataset.background = bg.key;
  // Fonds animés de palier (voir src/lib/backgrounds.ts) : on pose le nom de
  // la classe d'animation dans un attribut dédié, lu par globals.css, plutôt
  // que de l'ajouter/retirer comme classe (évite de piétiner d'autres
  // classes posées sur <html>).
  if (bg.animationClass) {
    document.documentElement.dataset.backgroundAnimated = bg.animationClass;
  } else {
    delete document.documentElement.dataset.backgroundAnimated;
  }
}

interface BackgroundContextValue {
  backgroundKey: string;
  setBackgroundKey: (key: string) => void;
}

const BackgroundContext = createContext<BackgroundContextValue>({
  backgroundKey: DEFAULT_BACKGROUND_KEY,
  setBackgroundKey: () => undefined
});

export function useBackground() {
  return useContext(BackgroundContext);
}

// Même schéma que ThemeProvider (voir theme-provider.tsx) : localStorage tout
// de suite (pas de flash), puis la valeur du bootstrap /api/me.
export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const [backgroundKey, setBackgroundKeyState] = useState(DEFAULT_BACKGROUND_KEY);
  const { data, patch } = useBootstrap();
  const serverBackground = data?.background;

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      setBackgroundKeyState(local);
      applyBackground(local);
    }
  }, []);

  useEffect(() => {
    if (!serverBackground) return;
    const local = localStorage.getItem(STORAGE_KEY);
    if (serverBackground !== local) {
      setBackgroundKeyState(serverBackground);
      applyBackground(serverBackground);
      localStorage.setItem(STORAGE_KEY, serverBackground);
    }
  }, [serverBackground]);

  const setBackgroundKey = useCallback(
    (key: string) => {
      setBackgroundKeyState(key);
      applyBackground(key);
      localStorage.setItem(STORAGE_KEY, key);
      patch({ background: key });
      fetch("/api/settings/background", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: key })
      }).catch(() => undefined);
    },
    [patch]
  );

  return (
    <BackgroundContext.Provider value={{ backgroundKey, setBackgroundKey }}>{children}</BackgroundContext.Provider>
  );
}
