"use client";

// Couleurs des régies dans les graphiques Publicité (lot 5). Palette
// catégorielle vérifiée (daltonisme, contraste) sur fond sombre et sur fond
// clair — ordre fixe, une couleur par régie, jamais recalculée selon le
// nombre de séries. Ce ne sont pas les couleurs des marques : la légende et
// le libellé écrit portent l'identité, la couleur ne fait que la répéter.
import { useMode } from "@/components/mode-provider";
import type { AdPlatform } from "@/lib/ads/types";

const DARK: Record<AdPlatform, string> = { GOOGLE_ADS: "#3987e5", META_ADS: "#d95926", TIKTOK_ADS: "#199e70" };
const LIGHT: Record<AdPlatform, string> = { GOOGLE_ADS: "#2a78d6", META_ADS: "#eb6834", TIKTOK_ADS: "#1baf7a" };

export function useAdColors(): Record<AdPlatform, string> {
  const { mode } = useMode();
  return mode === "light" ? LIGHT : DARK;
}
