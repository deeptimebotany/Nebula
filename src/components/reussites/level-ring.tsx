// Jauge circulaire du niveau de créateur (bandeau Réussites, carte du
// tableau de bord) : le numéro du niveau au centre, la progression vers le
// niveau suivant sur le cercle.
import { useId } from "react";

export function LevelRing({ level, pct, size = 88, stroke = 7, label = true }: { level: number; pct: number; size?: number; stroke?: number; label?: boolean }) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
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
        {label && size >= 64 && <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Niveau</span>}
        <span className="font-display font-semibold text-white" style={{ fontSize: size * 0.3 }}>
          {level}
        </span>
      </span>
    </span>
  );
}
