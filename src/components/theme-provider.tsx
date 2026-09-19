"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_THEME_KEY, findTheme } from "@/lib/themes";

const STORAGE_KEY = "nebula:theme";

function applyTheme(key: string) {
  const theme = findTheme(key);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.vars)) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = theme.key;
}

interface ThemeContextValue {
  themeKey: string;
  setThemeKey: (key: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeKey: DEFAULT_THEME_KEY,
  setThemeKey: () => undefined
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKeyState] = useState(DEFAULT_THEME_KEY);

  // Au montage : applique tout de suite ce qu'il y a en localStorage (pas de
  // flash), puis tente une synchronisation avec la préférence enregistrée
  // côté serveur (utile en se connectant depuis un nouvel appareil) —
  // échec silencieux si non connecté, ce n'est pas bloquant.
  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      setThemeKeyState(local);
      applyTheme(local);
    }
    fetch("/api/settings/theme")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.theme && d.theme !== local) {
          setThemeKeyState(d.theme);
          applyTheme(d.theme);
          localStorage.setItem(STORAGE_KEY, d.theme);
        }
      })
      .catch(() => undefined);
  }, []);

  const setThemeKey = useCallback((key: string) => {
    setThemeKeyState(key);
    applyTheme(key);
    localStorage.setItem(STORAGE_KEY, key);
    fetch("/api/settings/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: key })
    }).catch(() => undefined);
  }, []);

  return <ThemeContext.Provider value={{ themeKey, setThemeKey }}>{children}</ThemeContext.Provider>;
}
