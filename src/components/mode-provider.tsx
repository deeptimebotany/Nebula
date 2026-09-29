"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";
import {
  COLOR_MODE_STORAGE_KEY as STORAGE_KEY,
  DEFAULT_COLOR_MODE as DEFAULT_MODE,
  LEGACY_COLOR_MODE_STORAGE_KEY,
  isColorMode,
  type ColorMode
} from "@/lib/color-mode";

export type { ColorMode };

function applyMode(mode: ColorMode) {
  document.documentElement.dataset.mode = mode;
}

function readLocal(): ColorMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isColorMode(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLocal(mode: ColorMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* navigation privée stricte : le compte garde le choix */
  }
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

// Le mode est déjà posé sur <html> avant l'affichage (script de la mise en
// page racine, puis script du compte dans le layout du tableau de bord —
// voir color-mode.ts) ; ce fournisseur l'expose aux composants (graphiques,
// bouton soleil/lune) et enregistre les changements. Le compte fait foi :
// sa valeur (bootstrap /api/me) remplace celle du navigateur. Clair par
// défaut depuis le 29/09/2026. Le mode
// Clair/Sombre est INDÉPENDANT du thème de couleurs choisi dans Paramètres
// (voir themes.ts) : il inverse juste les surfaces (fond, texte, panneaux)
// par-dessus n'importe quel thème — voir globals.css, règle [data-mode="light"].
export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(DEFAULT_MODE);
  const { data, patch } = useBootstrap();
  const serverMode = data?.mode;

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_COLOR_MODE_STORAGE_KEY);
    } catch {
      /* rien à nettoyer */
    }
    const local = readLocal();
    if (local) {
      setModeState(local);
      applyMode(local);
    }
  }, []);

  useEffect(() => {
    if (!isColorMode(serverMode)) return;
    setModeState(serverMode);
    if (document.documentElement.dataset.mode !== serverMode) applyMode(serverMode);
    if (readLocal() !== serverMode) writeLocal(serverMode);
  }, [serverMode]);

  const setMode = useCallback(
    (next: ColorMode) => {
      setModeState(next);
      applyMode(next);
      writeLocal(next);
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
