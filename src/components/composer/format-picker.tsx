"use client";

// Choix du format dans Publier (07/10/2026, demande de Lucas) : Publication,
// Reel ou Story pour Instagram et Facebook ; pour YouTube, le format que
// YouTube choisira lui-même (Short ou vidéo), dit clairement plutôt qu'un
// faux choix. Règles : src/lib/social/post-format.ts.
import { clsx } from "@/lib/clsx";
import { InfoTip } from "@/components/ui/info-tip";
import { Toggle } from "@/components/ui/toggle";
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
      <div className="mb-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2" data-testid="youtube-kind">
        <p className="flex items-center gap-2 text-xs text-slate-300">
          <span className="text-slate-400">Format :</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-medium text-white">{kind === "SHORT" ? "Short" : kind === "VIDEO" ? "Vidéo" : "Short ou vidéo"}</span>
          <span className="text-slate-500">(choisi par YouTube)</span>
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{youtubeKindText(facts)}</p>
      </div>
    );
  }
  if (!FORMAT_NETWORKS.has(network) || !value) return null;

  const options = formatOptions(network, facts);
  const selected = options.find((o) => o.format === value);
  const problem = formatProblem(network, value, facts);
  return (
    <div className="mb-3" data-testid={`format-${network}`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        Format
        <InfoTip label={`Formats possibles sur ${network === "INSTAGRAM" ? "Instagram" : "Facebook"}`}>{HELP[network]}</InfoTip>
      </div>
      <div role="radiogroup" aria-label={`Format sur ${network === "INSTAGRAM" ? "Instagram" : "Facebook"}`} className="mt-1.5 grid grid-cols-3 gap-1.5">
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
                "rounded-lg border px-2 py-1.5 text-xs font-medium transition",
                active
                  ? o.unavailable
                    ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                    : "border-aurora-400/70 bg-aurora-400/15 text-white"
                  : "border-white/10 text-slate-300 hover:border-aurora-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-slate-300"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className={clsx("mt-1.5 text-[11px] leading-snug", problem ? "text-amber-300" : "text-slate-500")}>{problem ?? selected?.hint}</p>
      {network === "INSTAGRAM" && value === "REEL" && onShareToFeedChange && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">Aussi sur votre profil (fil)</span>
          <Toggle size="sm" checked={shareToFeed ?? true} onChange={onShareToFeedChange} aria-label="Afficher aussi le Reel sur votre profil Instagram" />
        </div>
      )}
    </div>
  );
}
