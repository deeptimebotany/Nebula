"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_BACKGROUND_KEY, findBackground } from "@/lib/backgrounds";

const STORAGE_KEY = "nebula:background";

function applyBackground(key: string) {
  const bg = findBackground(key);
  document.documentElement.style.setProperty("--app-bg", bg.css);
  document.documentElement.dataset.background = bg.key;
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

// Même schéma que ThemeProvider (voir theme-provider.tsx) : applique tout de
// suite ce qu'il y a en localStorage (pas de flash), puis synchronise avec
// la préférence enregistrée côté serveur.
export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const [backgroundKey, setBackgroundKeyState] = useState(DEFAULT_BACKGROUND_KEY);

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      setBackgroundKeyState(local);
      applyBackground(local);
    }
    fetch("/api/settings/background")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.background && d.background !== local) {
          setBackgroundKeyState(d.background);
          applyBackground(d.background);
          localStorage.setItem(STORAGE_KEY, d.background);
        }
      })
      .catch(() => undefined);
  }, []);

  const setBackgroundKey = useCallback((key: string) => {
    setBackgroundKeyState(key);
    applyBackground(key);
    localStorage.setItem(STORAGE_KEY, key);
    fetch("/api/settings/background", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ background: key })
    }).catch(() => undefined);
  }, []);

  return (
    <BackgroundContext.Provider value={{ backgroundKey, setBackgroundKey }}>{children}</BackgroundContext.Provider>
  );
}
