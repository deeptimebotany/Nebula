"use client";

// Choix du format dans Publier (07/10/2026, demande de Lucas) : Publication,
// Reel ou Story pour Instagram et Facebook ; pour YouTube, le format que
// YouTube choisira lui-même (Short ou vidéo), dit clairement plutôt qu'un
// faux choix. Règles : src/lib/social/post-format.ts.
// Refonte V2 (07/10/2026) : une ligne compacte par réseau sous « Publier
// sur » — nom du réseau, choix segmenté, explication en dessous.
import { clsx } from "@/lib/clsx";
import { InfoTip } from "@/components/ui/info-tip";
import { Toggle } from "@/components/ui/toggle";
import { NetworkTile } from "@/components/ui/network-badge";
import { FORMAT_NETWORKS, formatOptions, formatProblem, youtubeKind, youtubeKindText, type MediaFacts, type PostFormat } from "@/lib/social/post-format";
import type { Network } from "@/lib/types";

const HELP: Partial<Record<Network, string>> = {
  INSTAGRAM:
    "Publication : image ou carrousel dans le fil. Reel : vidéo dans l'onglet Reels, et sur votre profil si vous le gardez coché. Story : une image ou une vidéo de 60 s au plus, visible 24 h ; la légende ne s'y affiche pas.",
  FACEBOOK:
    "Publication : texte, photos ou vidéo classique dans le fil de la Page. Reel : vidéo verticale de 3 à 90 s. Story : une photo, ou une vidéo verticale de 60 s au plus, visible 24 h ; le texte ne s'y affiche pas."
};

export function FormatPicker({
  network,
  facts,
  value,
  onChange,
  shareToFeed,
  onShareToFeedChange
}: {
  network: Network;
  facts: MediaFacts;
  value: PostFormat | null;
  onChange: (format: PostFormat) => void;
  /** Instagram, Reel : aussi dans le fil du profil. */
  shareToFeed?: boolean;
  onShareToFeedChange?: (next: boolean) => void;
}) {
  if (network === "YOUTUBE") {
    const kind = youtubeKind(facts);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="youtube-kind">
        <span className="flex w-28 shrink-0 items-center gap-2 text-[13px] text-slate-400">
          <NetworkTile network="YOUTUBE" size={18} />
          YouTube
        </span>
        <p className="flex items-center gap-2 text-[13px] text-slate-300">
          <span className="text-slate-400">Format :</span>
          <span className="font-medium text-white">{kind === "SHORT" ? "Short" : kind === "VIDEO" ? "Vidéo" : "Short ou vidéo"}</span>
          <span className="text-slate-500">(choisi par YouTube)</span>
        </p>
        <p className="basis-full text-[12px] leading-snug text-slate-500 sm:pl-[124px]">{youtubeKindText(facts)}</p>
      </div>
    );
  }
  if (!FORMAT_NETWORKS.has(network) || !value) return null;

  const options = formatOptions(network, facts);
  const selected = options.find((o) => o.format === value);
  const problem = formatProblem(network, value, facts);
  const name = network === "INSTAGRAM" ? "Instagram" : "Facebook";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid={`format-${network}`}>
      <span className="flex w-28 shrink-0 items-center gap-2 text-[13px] text-slate-400">
        <NetworkTile network={network} size={18} />
        {name}
      </span>
      <div role="radiogroup" aria-label={`Format sur ${name}`} className="inline-flex rounded-lg border border-[color:var(--nb-sep-strong)] p-0.5">
        {options.map((o) => {
          const active = o.format === value;
          return (
            <button
              key={o.format}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={Boolean(o.unavailable) && !active}
              title={o.unavailable ? o.unavailable.charAt(0).toUpperCase() + o.unavailable.slice(1) : o.hint}
              onClick={() => onChange(o.format)}
              className={clsx(
                "rounded-md px-3 py-1 text-[13px] transition",
                active
                  ? o.unavailable
                    ? "bg-amber-400/15 font-medium text-amber-200"
                    : "bg-[color:var(--nb-active)] font-medium text-white"
                  : "text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <InfoTip label={`Formats possibles sur ${name}`}>{HELP[network]}</InfoTip>
      {network === "INSTAGRAM" && value === "REEL" && onShareToFeedChange && (
        <span className="flex items-center gap-2 text-[13px] text-slate-400">
          Aussi sur votre profil
          <Toggle size="sm" checked={shareToFeed ?? true} onChange={onShareToFeedChange} aria-label="Afficher aussi le Reel sur votre profil Instagram" />
        </span>
      )}
      <p className={clsx("basis-full text-[12px] leading-snug sm:pl-[124px]", problem ? "text-amber-300" : "text-slate-500")}>{problem ?? selected?.hint}</p>
    </div>
  );
}
