"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "nebula:mode";
export type ColorMode = "dark" | "light";
const DEFAULT_MODE: ColorMode = "dark";

function applyMode(mode: ColorMode) {
  document.documentElement.dataset.mode = mode;
}

interface ModeContextValue {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggleMode: () => void;
}

const ModeContext = createContext<ModeContextValue>({
  mode: DEFAULT_MODE,
  setMode: () => undefined,
  toggleMode: () => undefined
});

export function useMode() {
  return useContext(ModeContext);
}

// Même schéma que ThemeProvider/BackgroundProvider : applique tout de suite
// ce qu'il y a en localStorage (pas de flash), puis synchronise avec la
// préférence enregistrée côté serveur. Le mode Clair/Sombre est INDÉPENDANT
// du thème de couleurs choisi dans Paramètres (voir themes.ts) : il inverse
// juste les surfaces (fond, texte, panneaux) par-dessus n'importe quel
// thème — voir globals.css, règle [data-mode="light"].
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(DEFAULT_MODE);

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
    if (local === "dark" || local === "light") {
      setModeState(local);
      applyMode(local);
    }
    fetch("/api/settings/mode")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if ((d?.mode === "dark" || d?.mode === "light") && d.mode !== local) {
          setModeState(d.mode);
          applyMode(d.mode);
          localStorage.setItem(STORAGE_KEY, d.mode);
        }
      })
      .catch(() => undefined);
  }, []);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    applyMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    fetch("/api/settings/mode", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next })
    }).catch(() => undefined);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, setMode]);

  return <ModeContext.Provider value={{ mode, setMode, toggleMode }}>{children}</ModeContext.Provider>;
}
