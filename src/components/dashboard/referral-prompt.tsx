"use client";

// Invitation de parrainage contextuelle (brief growth, lot G7) : carte
// inline dans la page concernée — jamais un toast, compatible Mode focus —
// affichée UNE seule fois par déclencheur (User.referralPromptsSeen) :
//   first_multi_network — première publication publiée sur ≥ 2 réseaux ;
//   first_report_sent   — premier rapport client envoyé ;
//   followers_1000 / followers_10000 — seuil franchi (page Analytics).
// Lien copié en un clic (événement referral_link_copied), partage natif sur
// téléphone. Le parrainage lui-même : filleul 30 jours de Pro, parrain un
// mois de Pro quand le filleul est abonné depuis 30 jours, dans la limite
// de 12 mois sur 12 mois glissants (voir src/lib/billing/rewards.ts).
import { useEffect, useState } from "react";
import { useBootstrap } from "@/components/bootstrap-provider";
import { IconGift, IconClose } from "@/components/dashboard/icons";
import { trackGrowthEvent } from "@/lib/growth-client";
import { REFERRED_TRIAL_DAYS } from "@/lib/trial";
import { clsx } from "@/lib/clsx";

export type ReferralPromptKey = "first_multi_network" | "first_report_sent" | "followers_1000" | "followers_10000";

const CONTEXT: Record<ReferralPromptKey, string> = {
  first_multi_network: "Première publication sur plusieurs réseaux en un seul envoi.",
  first_report_sent: "Votre premier rapport client est parti.",
  followers_1000: "1 000 abonnés franchis.",
  followers_10000: "10 000 abonnés franchis."
};

export function ReferralPrompt({ trigger, className }: { trigger: ReferralPromptKey; className?: string }) {
  const { data: me, patch } = useBootstrap();
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const eligible = Boolean(me?.referralCode) && !(me?.referralPromptsSeen ?? []).includes(trigger);

  // Marquée comme vue dès l'affichage (une seule fois par déclencheur).
  useEffect(() => {
    if (!eligible) return;
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    fetch("/api/referral/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: trigger }) }).catch(() => undefined);
    // Le bootstrap n'est mis à jour qu'à la fermeture : la carte reste
    // visible pendant cette visite de page.
  }, [eligible, trigger]);

  if (!eligible || !me || dismissed) return null;
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${me.referralCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackGrowthEvent("referral_link_copied", { trigger });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible : le lien reste affiché en clair
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Nebula", text: `${REFERRED_TRIAL_DAYS} jours de Pro offerts sur Nebula`, url });
      trackGrowthEvent("referral_link_copied", { trigger, via: "share" });
    } catch {
      // partage annulé
    }
  }

  function close() {
    setDismissed(true);
    patch({ referralPromptsSeen: [...(me?.referralPromptsSeen ?? []), trigger] });
  }

  return (
    <div className={clsx("rounded-2xl border border-aurora-400/25 bg-aurora-400/[0.06] p-4 sm:p-5", className)} role="region" aria-label="Offrir Nebula à un ami">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-aurora-400/15 text-aurora-200">
          <IconGift className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-aurora-200/80">{CONTEXT[trigger]}</p>
          <p className="mt-1 font-display text-base font-semibold text-white">Ça marche pour vous. Offrez {REFERRED_TRIAL_DAYS} jours de Pro à un ami créateur — et gagnez un mois de Pro s&apos;il s&apos;abonne.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-slate-200">{url}</code>
            <button type="button" onClick={copy} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:border-aurora-400/60">
              {copied ? "Copié !" : "Copier le lien"}
            </button>
            {canShare && (
              <button type="button" onClick={share} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:border-aurora-400/60">
                Partager
              </button>
            )}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Fermer" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
