import type { CSSProperties } from "react";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { IconTikTok, IconYouTube, IconInstagram, IconFacebook, IconBluesky, IconThreads, IconPinterest, IconLinkedIn } from "@/components/dashboard/icons";

const NETWORK_ICONS: Record<Network, (props: { className?: string }) => JSX.Element> = {
  TIKTOK: IconTikTok,
  YOUTUBE: IconYouTube,
  INSTAGRAM: IconInstagram,
  FACEBOOK: IconFacebook,
  BLUESKY: IconBluesky,
  THREADS: IconThreads,
  PINTEREST: IconPinterest,
  LINKEDIN: IconLinkedIn
};

/** Glyphe du réseau (voir icons.tsx) — utilisé notamment dans "Réseaux cibles". */
export function NetworkLogo({ network, className = "h-5 w-5" }: { network: Network; className?: string }) {
  const Icon = NETWORK_ICONS[network];
  return <Icon className={className} />;
}

/**
 * Couleur de texte d'un réseau, lisible dans les deux modes : la classe
 * `network-ink` (globals.css) lit --nb en sombre et --nb-ink (teinte
 * assombrie, ≥ 4,5:1 sur blanc) en mode clair. À poser avec `style` sur
 * l'élément qui porte la classe. Avant : couleur de marque en `style`
 * inline, illisible sur fond clair (TikTok cyan sur blanc : 1,7:1).
 */
export function networkInkStyle(network: Network): CSSProperties {
  const meta = NETWORK_META[network];
  return { "--nb": meta.color, "--nb-ink": meta.ink } as CSSProperties;
}

// Pastille de réseau (refonte du 24/09/2026, « badges qui font brouillon ») :
// une pastille neutre, identique partout (Commentaires, Engagements, comptes,
// publications…), avec le logo officiel sur sa couleur de marque — au lieu
// d'un fond et d'un contour teintés à la couleur du réseau (le rouge YouTube
// criait à côté du reste). `muted` : option non retenue, logo en gris.
export function NetworkBadge({ network, size = "md", muted = false }: { network: Network; size?: "sm" | "md"; muted?: boolean }) {
  const meta = NETWORK_META[network];
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition",
        size === "sm" ? "py-0.5 pl-0.5 pr-2 text-[11px]" : "py-0.5 pl-0.5 pr-2.5 text-xs",
        muted ? "border-white/10 bg-white/[0.02] text-slate-400" : "border-white/10 bg-white/[0.04] text-slate-200"
      )}
    >
      <NetworkTile network={network} size={size === "sm" ? 16 : 20} className={muted ? "opacity-50 grayscale" : undefined} />
      {meta.label}
    </span>
  );
}

export function NetworkDot({ network }: { network: Network }) {
  const meta = NETWORK_META[network];
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.glow}` }} title={meta.label} />;
}

// --- Logos sur leur couleur de marque (24/09/2026, proposition A validée par
// Lucas pour « Réseaux cibles ») : le pictogramme simplifié de Nebula, en
// blanc, posé sur la couleur officielle du réseau (dégradé pour Instagram,
// noir pour TikTok et Threads). Rond pour Facebook et Pinterest, carré
// arrondi pour les autres.
const TILE_BG: Record<Network, string> = {
  INSTAGRAM: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)",
  FACEBOOK: "#1877F2",
  TIKTOK: "#000000",
  YOUTUBE: "#FF0000",
  BLUESKY: "#1185FE",
  THREADS: "#000000",
  PINTEREST: "#E60023",
  LINKEDIN: "#0A66C2"
};
const ROUND_TILES = new Set<Network>(["FACEBOOK", "PINTEREST"]);
// Réseaux dont la couleur est le noir : contour clair en mode sombre.
const DARK_BRAND = new Set<Network>(["TIKTOK", "THREADS"]);

export function NetworkTile({ network, size = 22, className }: { network: Network; size?: number; className?: string }) {
  return (
    <span
      className={clsx("nt-tile inline-flex shrink-0 items-center justify-center", DARK_BRAND.has(network) && "nt-tile-dark", className)}
      style={{ width: size, height: size, borderRadius: ROUND_TILES.has(network) ? size / 2 : Math.round(size * 0.28), background: TILE_BG[network], color: "#fff" }}
      aria-hidden="true"
    >
      <NetworkLogo network={network} className="h-[66%] w-[66%]" />
    </span>
  );
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Couleur d'accent d'un réseau choisi (contour, fond teinté, coche). Noir
// pour TikTok et Threads en clair, blanc cassé en sombre.
function edgeVars(network: Network): CSSProperties {
  const meta = NETWORK_META[network];
  const edge = network === "INSTAGRAM" ? "#E1306C" : DARK_BRAND.has(network) ? "#f2f2f2" : meta.color;
  const edgeLight = DARK_BRAND.has(network) ? "#111111" : edge;
  return {
    "--nt-edge": edge,
    "--nt-edge-light": edgeLight,
    "--nt-tint": `rgb(${hexToRgb(edge)} / 0.14)`,
    "--nt-tint-light": `rgb(${hexToRgb(edgeLight)} / ${DARK_BRAND.has(network) ? 0.06 : 0.09})`,
    "--nt-check-ink": DARK_BRAND.has(network) ? "#111111" : "#ffffff"
  } as CSSProperties;
}

/**
 * Pastille d'un réseau dans « Réseaux cibles » (Publier) :
 *  - "selected" : choisi — contour et fond teintés de la couleur du réseau, coche ;
 *  - "idle"     : connecté, pas choisi — logo en couleur, pastille neutre ;
 *  - "connect"  : pas encore connecté — pointillés et « + connecter ».
 */
export function NetworkTargetChip({ network, state }: { network: Network; state: "selected" | "idle" | "connect" }) {
  const meta = NETWORK_META[network];
  return (
    <span className={clsx("nt-chip", `nt-chip-${state}`)} style={state === "selected" ? edgeVars(network) : undefined}>
      <NetworkTile network={network} size={22} className={state === "connect" ? "opacity-80" : undefined} />
      <span className={clsx("nt-chip-label", state === "selected" && "font-semibold")}>{meta.label}</span>
      {state === "connect" && <span className="nt-chip-cta">+ connecter</span>}
      {state === "selected" && (
        <span className="nt-chip-check" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </span>
  );
}
