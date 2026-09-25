// Jauge circulaire du rang de créateur (bandeau Réussites, carte du tableau
// de bord, menu, fenêtre des rangs) : l'emblème du rang au centre, la
// progression dans le palier sur le cercle (Réussites v2 ; avant : le
// numéro du niveau).
import { useId } from "react";
import { stepDef } from "@/lib/reussites/catalog";
import { RankEmblem } from "./rank-emblem";

export function LevelRing({
  level,
  pct,
  size = 88,
  stroke = 7,
  label = true,
  animated = false
}: {
  /** Palier de rang 1 à 15. */
  level: number;
  pct: number;
  size?: number;
  stroke?: number;
  label?: boolean;
  animated?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const step = stepDef(level);
  const roman = ["I", "II", "III"][step.tier - 1];
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={`lr-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-nebula-500))" />
            <stop offset="100%" stopColor="rgb(var(--c-aurora-400))" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-white/[0.07]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#lr-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray .8s ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <RankEmblem rankId={step.rankId} size={Math.round(size * (label && size >= 64 ? 0.5 : 0.62))} animated={animated} />
        {label && size >= 64 && (
          <span className="mt-0.5 font-display font-semibold text-white" style={{ fontSize: Math.max(10, size * 0.13) }}>
            {roman}
          </span>
        )}
      </span>
    </span>
  );
}
