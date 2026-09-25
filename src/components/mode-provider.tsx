"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";

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

// Même schéma que ThemeProvider/BackgroundProvider : localStorage tout de
// suite (pas de flash), puis la valeur du bootstrap /api/me. Le mode
// Clair/Sombre est INDÉPENDANT du thème de couleurs choisi dans Paramètres
// (voir themes.ts) : il inverse juste les surfaces (fond, texte, panneaux)
// par-dessus n'importe quel thème — voir globals.css, règle [data-mode="light"].
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(DEFAULT_MODE);
  const { data, patch } = useBootstrap();
  const serverMode = data?.mode;

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
    if (local === "dark" || local === "light") {
      setModeState(local);
      applyMode(local);
    }
  }, []);

  useEffect(() => {
    if (serverMode !== "dark" && serverMode !== "light") return;
    const local = localStorage.getItem(STORAGE_KEY);
    if (serverMode !== local) {
      setModeState(serverMode);
      applyMode(serverMode);
      localStorage.setItem(STORAGE_KEY, serverMode);
    }
  }, [serverMode]);

  const setMode = useCallback(
    (next: ColorMode) => {
      setModeState(next);
      applyMode(next);
      localStorage.setItem(STORAGE_KEY, next);
      patch({ mode: next });
      fetch("/api/settings/mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next })
      }).catch(() => undefined);
    },
    [patch]
  );

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
