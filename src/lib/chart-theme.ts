"use client";

// Couleurs des graphiques dérivées du THÈME ACTIF (Lot 4). Recharts ne lit
// pas les variables CSS : ce hook lit les tokens `--c-*` posés sur <html>
// par ThemeProvider (voir src/lib/themes.ts) et les convertit en couleurs
// utilisables par SVG, puis se recalcule à chaque changement de thème ou de
// mode clair/sombre. Avant : hexadécimaux codés en dur dans chaque page,
// identiques quel que soit le thème choisi dans Paramètres.
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { useMode } from "@/components/mode-provider";
import { NETWORK_META, type Network } from "@/lib/types";

export interface ChartTheme {
  /** Palette de séries (accent du thème d'abord, puis contrastes). */
  series: string[];
  /** Couleur d'une série : couleur officielle du réseau si la clé en est un, sinon palette du thème. */
  seriesColor: (key: string, index: number) => string;
  axis: string;
  grid: string;
  text: string;
  tooltip: { background: string; border: string; color: string; borderRadius: number; fontSize: number };
  labelStyle: { color: string };
}

function readToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : fallback;
}

function build(mode: "dark" | "light"): ChartTheme {
  const nebula500 = readToken("--c-nebula-500", "rgb(38 76 201)");
  const aurora400 = readToken("--c-aurora-400", "rgb(106 137 241)");
  const cyan = readToken("--c-accent-cyan", "rgb(99 230 255)");
  const violet = readToken("--c-accent-violet", "rgb(124 108 240)");
  const magenta = readToken("--c-accent-magenta", "rgb(232 87 176)");
  const nebula300 = readToken("--c-nebula-300", "rgb(118 144 229)");
  const light = mode === "light";
  const series = [nebula500, cyan, violet, magenta, aurora400, nebula300];
  return {
    series,
    seriesColor: (key, index) => (key in NETWORK_META ? NETWORK_META[key as Network].color : series[index % series.length]),
    axis: light ? "#6b6f76" : "#7b879e",
    grid: light ? "rgba(15,23,42,0.08)" : "rgba(148,163,255,0.08)",
    text: light ? "#1f2937" : "#eaf0ff",
    tooltip: {
      background: light ? "rgba(255,255,255,0.97)" : "rgba(10,14,26,0.95)",
      border: light ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(120,150,255,0.25)",
      color: light ? "#1f2937" : "#eaf0ff",
      borderRadius: 12,
      fontSize: 12
    },
    labelStyle: { color: light ? "#4b5563" : aurora400 }
  };
}

export function useChartTheme(): ChartTheme {
  const { themeKey } = useTheme();
  const { mode } = useMode();
  const [tick, setTick] = useState(0);

  // Les tokens sont posés sur <html> par ThemeProvider dans un effet : on
  // relit juste après, une fois monté et à chaque changement de thème/mode.
  useEffect(() => {
    setTick((t) => t + 1);
  }, [themeKey, mode]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => build(mode), [mode, themeKey, tick]);
}
