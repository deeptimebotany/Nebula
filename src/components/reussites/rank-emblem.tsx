// Emblèmes des rangs de créateur (Réussites v2, 26/09/2026) : étincelle →
// comète → étoile → constellation → nébuleuse en spirale. Dessinés en SVG,
// lisibles de 14 px (pastille de la Communauté) à 160 px (bandeau).
// `animated` : flottement très lent (bandeau), coupé si l'appareil demande
// moins d'animations (classe nb-rank-float, globals.css).
import { useId } from "react";
import type { RankId } from "@/lib/reussites/catalog";
import { clsx } from "@/lib/clsx";

export const RANK_COLORS: Record<RankId, string> = {
  etincelle: "#f2cf6b",
  comete: "#7a95ff",
  etoile: "#aebcff",
  constellation: "#bb8fff",
  nebuleuse: "#f062d0"
};

export function RankEmblem({ rankId, size = 48, animated = false, className, title }: { rankId: RankId; size?: number; animated?: boolean; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const label = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };
  return (
    // currentColor = blanc en mode sombre, encre foncée en mode clair (text-white est
    // remappé par globals.css) : les parties blanches restent visibles partout.
    <svg width={size} height={size} viewBox="0 0 64 64" className={clsx(animated && "nb-rank-float", "shrink-0 text-white", className)} {...label}>
      {rankId === "etincelle" && (
        <>
          <circle cx="32" cy="32" r="22" fill="#f2cf6b" opacity="0.14" />
          <path d="M32 10 L35.5 28.5 L54 32 L35.5 35.5 L32 54 L28.5 35.5 L10 32 L28.5 28.5 Z" fill="#f2cf6b" />
          <circle cx="47" cy="16" r="2.2" fill="currentColor" opacity="0.8" />
        </>
      )}
      {rankId === "comete" && (
        <>
          <defs>
            <linearGradient id={`rt-${uid}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#5fe0f0" stopOpacity="0" />
              <stop offset="1" stopColor="#7a95ff" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <path d="M9 53 C 22 45, 33 37, 41 25" fill="none" stroke={`url(#rt-${uid})`} strokeWidth="7" strokeLinecap="round" />
          <circle cx="43" cy="22" r="13" fill="#bb8fff" opacity="0.25" />
          <circle cx="43" cy="22" r="8" fill="currentColor" />
          <circle cx="16" cy="18" r="1.6" fill="currentColor" opacity="0.7" />
        </>
      )}
      {rankId === "etoile" && (
        <>
          <circle cx="32" cy="32" r="26" fill="#7a95ff" opacity="0.14" />
          <path d="M32 18 L34 30 L46 32 L34 34 L32 46 L30 34 L18 32 L30 30 Z" fill="#7a95ff" opacity="0.85" transform="rotate(45 32 32)" />
          <path d="M32 6 L36 28 L58 32 L36 36 L32 58 L28 36 L6 32 L28 28 Z" fill="currentColor" />
        </>
      )}
      {rankId === "constellation" && (
        <>
          <path d="M10 44 L22 24 L36 34 L48 14 L54 42 Z" fill="none" stroke="#bb8fff" strokeOpacity="0.65" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="10" cy="44" r="4" fill="currentColor" />
          <circle cx="22" cy="24" r="5" fill="#bb8fff" />
          <circle cx="36" cy="34" r="4" fill="currentColor" />
          <circle cx="48" cy="14" r="6" fill="#f062d0" />
          <circle cx="54" cy="42" r="4" fill="#5fe0f0" />
        </>
      )}
      {rankId === "nebuleuse" && (
        <>
          <circle cx="32" cy="32" r="27" fill="#f062d0" opacity="0.12" />
          <g className={animated ? "nb-rank-spin" : undefined}>
            <path d="M32 32 C 32 25, 43 23, 47 30 C 52 41, 38 52, 27 49 C 13 44, 13 24, 26 17 C 40 9, 58 19, 58 35" fill="none" stroke="#a066ff" strokeWidth="3" strokeLinecap="round" />
            <path d="M32 32 C 32 39, 21 41, 17 34" fill="none" stroke="#5fe0f0" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="32" cy="32" r="4.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
