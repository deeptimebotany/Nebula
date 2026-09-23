import type { CSSProperties } from "react";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { IconTikTok, IconYouTube, IconInstagram, IconFacebook } from "@/components/dashboard/icons";

const NETWORK_ICONS: Record<Network, (props: { className?: string }) => JSX.Element> = {
  TIKTOK: IconTikTok,
  YOUTUBE: IconYouTube,
  INSTAGRAM: IconInstagram,
  FACEBOOK: IconFacebook
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

export function NetworkBadge({ network, size = "md", muted = false }: { network: Network; size?: "sm" | "md"; muted?: boolean }) {
  const meta = NETWORK_META[network];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        // `muted` : option non retenue (ex. réseaux cibles de Publier) — gris
        // neutre au lieu d'une opacité réduite, pour rester lisible.
        muted ? "border-white/10 bg-white/[0.03] text-slate-400" : "network-ink"
      )}
      style={muted ? undefined : { ...networkInkStyle(network), borderColor: `${meta.color}55`, background: `${meta.color}14` }}
    >
      <NetworkLogo network={network} className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {meta.label}
    </span>
  );
}

export function NetworkDot({ network }: { network: Network }) {
  const meta = NETWORK_META[network];
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.glow}` }} title={meta.label} />;
}
