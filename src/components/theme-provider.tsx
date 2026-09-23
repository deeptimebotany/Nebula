"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_THEME_KEY, findTheme } from "@/lib/themes";
import { useBootstrap } from "@/components/bootstrap-provider";

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

// Au montage : applique tout de suite ce qu'il y a en localStorage (pas de
// flash), puis se cale sur la préférence enregistrée côté serveur dès que le
// bootstrap (/api/me, une seule requête pour toutes les préférences) a
// répondu — utile en se connectant depuis un nouvel appareil.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKeyState] = useState(DEFAULT_THEME_KEY);
  const { data, patch } = useBootstrap();
  const serverTheme = data?.theme;

  useEffect(() => {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      setThemeKeyState(local);
      applyTheme(local);
    }
  }, []);

  useEffect(() => {
    if (!serverTheme) return;
    const local = localStorage.getItem(STORAGE_KEY);
    if (serverTheme !== local) {
      setThemeKeyState(serverTheme);
      applyTheme(serverTheme);
      localStorage.setItem(STORAGE_KEY, serverTheme);
    }
  }, [serverTheme]);

  const setThemeKey = useCallback(
    (key: string) => {
      setThemeKeyState(key);
      applyTheme(key);
      localStorage.setItem(STORAGE_KEY, key);
      patch({ theme: key });
      fetch("/api/settings/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: key })
      }).catch(() => undefined);
    },
    [patch]
  );

  return <ThemeContext.Provider value={{ themeKey, setThemeKey }}>{children}</ThemeContext.Provider>;
}
