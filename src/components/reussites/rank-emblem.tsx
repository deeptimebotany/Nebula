// Insignes des rangs de créateur (Réussites v3, 02/10/2026) : un hexagone
// sobre, de la couleur du rang, avec une marque qui grandit d'un rang à
// l'autre (point, chevrons, losanges, lauriers, couronne). Remplacent les
// emblèmes d'astres de la v2, jugés enfantins. Dessinés en SVG, lisibles de
// 14 px (pastille de la Communauté) à 160 px (bandeau).
// `animated` : flottement très lent (bandeau), coupé si l'appareil demande
// moins d'animations (classe nb-rank-float, globals.css).
import { useId } from "react";
import type { RankId } from "@/lib/reussites/catalog";
import { clsx } from "@/lib/clsx";

export const RANK_COLORS: Record<RankId, string> = {
  lancement: "#8b95a7",
  emergent: "#4fb3c8",
  regulier: "#4f9cf0",
  confirme: "#7a95ff",
  etabli: "#a066ff",
  influent: "#d06bf0",
  reference: "#e2b04a",
  icone: "#f062d0"
};

const HEX = "M32 5 L55.4 18.5 L55.4 45.5 L32 59 L8.6 45.5 L8.6 18.5 Z";
const DIAMOND = "M32 18 L45 32 L32 46 L19 32 Z";

function chevrons(count: number, color: string, ink: string) {
  const gap = 8;
  const top = 32 - ((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, i) => (
    <path key={`c${i}`} d={`M20 ${top + i * gap + 5} L32 ${top + i * gap - 4} L44 ${top + i * gap + 5}`} fill="none" stroke={i === 0 ? ink : color} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
  ));
}

/**
 * Éléments SVG de l'insigne (viewBox 0 0 64 64), sans hook : servent aussi
 * aux images générées par next/og (carte de créateur, carte de record), où
 * `ink` remplace currentColor.
 */
export function rankEmblemParts(rankId: RankId, { ink = "currentColor", gradId }: { ink?: string; gradId: string }) {
  const color = RANK_COLORS[rankId] ?? RANK_COLORS.lancement;
  const icon = rankId === "icone";
  const stroke = icon ? `url(#${gradId})` : color;
  const parts = [];
  if (icon) {
    parts.push(
      <defs key="defs">
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5fe0f0" />
          <stop offset="0.5" stopColor="#a066ff" />
          <stop offset="1" stopColor="#f062d0" />
        </linearGradient>
      </defs>
    );
  }
  parts.push(<path key="hex" d={HEX} fill={color} fillOpacity={0.14} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />);
  if (rankId === "lancement") {
    parts.push(<circle key="ring" cx="32" cy="32" r="11" fill="none" stroke={color} strokeWidth="2.5" opacity="0.7" />, <circle key="dot" cx="32" cy="32" r="5" fill={ink} />);
  }
  if (rankId === "emergent") parts.push(...chevrons(1, color, ink));
  if (rankId === "regulier") parts.push(...chevrons(2, color, ink));
  if (rankId === "confirme") parts.push(...chevrons(3, color, ink));
  if (rankId === "etabli") {
    parts.push(<path key="d1" d={DIAMOND} fill={color} />, <path key="d2" d="M32 25 L38.5 32 L32 39 L25.5 32 Z" fill={ink} />);
  }
  if (rankId === "influent") {
    parts.push(
      <path key="d1" d={DIAMOND} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />,
      <path key="d2" d="M32 23 L40.5 32 L32 41 L23.5 32 Z" fill={color} />,
      <path key="d3" d="M32 28 L36 32 L32 36 L28 32 Z" fill={ink} />
    );
  }
  if (rankId === "reference") {
    // Lauriers : deux branches autour d'un losange.
    parts.push(
      <path key="b1" d="M22 47 C 14 40, 13 27, 21 17" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" />,
      <path key="b2" d="M42 47 C 50 40, 51 27, 43 17" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
    );
    for (const [x, y, r] of [
      [17, 40, -35],
      [15.5, 32, -10],
      [17, 24, 20]
    ]) {
      parts.push(
        <ellipse key={`l${x}-${y}`} cx={x} cy={y} rx="2.4" ry="4.4" fill={color} transform={`rotate(${r} ${x} ${y})`} />,
        <ellipse key={`r${x}-${y}`} cx={64 - x} cy={y} rx="2.4" ry="4.4" fill={color} transform={`rotate(${-r} ${64 - x} ${y})`} />
      );
    }
    parts.push(<path key="d" d="M32 23 L39 32 L32 41 L25 32 Z" fill={ink} />);
  }
  if (icon) {
    // Couronne.
    parts.push(
      <path key="crown" d="M18 42 L19.5 23 L27 31 L32 19 L37 31 L44.5 23 L46 42 Z" fill={`url(#${gradId})`} strokeLinejoin="round" />,
      <rect key="base" x="18" y="44" width="28" height="4" rx="2" fill={ink} />,
      <circle key="gem" cx="32" cy="34" r="2.6" fill={ink} />
    );
  }
  return parts;
}

export function RankEmblem({ rankId, size = 48, animated = false, className, title }: { rankId: RankId; size?: number; animated?: boolean; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const label = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };
  return (
    // currentColor = blanc en mode sombre, encre foncée en mode clair (text-white est
    // remappé par globals.css) : les parties claires restent visibles partout.
    <svg width={size} height={size} viewBox="0 0 64 64" className={clsx(animated && "nb-rank-float", "shrink-0 text-white", className)} {...label}>
      {rankEmblemParts(rankId, { gradId: `ri-${uid}` })}
    </svg>
  );
}
