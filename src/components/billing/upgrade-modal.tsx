"use client";

// Paywall contextuel (brief growth, lot G2.b) : UNE modale pour toutes les
// fonctions verrouillées, avec une raison (`reason`) qui choisit le titre,
// deux phrases de bénéfice concret, le visuel produit, le prix lu dans
// plans.ts et le bouton « Passer en Pro » (Checkout Stripe). Elle remplace
// les anciens messages « réservé aux paliers Pro/Agence » et s'ouvre :
//   - au clic sur une fonction verrouillée (page Rapports, Rétention…) ;
//   - quand une API répond 402/403 avec `reason` (openUpgradeFromResponse).
// Offre unique de bienvenue : à la première ouverture par un compte dont
// l'essai est terminé (ou sans essai), le serveur pose offerExpiresAt
// (48 h) ; tant qu'elle est valide, la modale et Facturation affichent
// « -50 % sur votre premier mois » avec un compte à rebours. Une seule fois
// par compte, jamais pour un compte payant, mensuel uniquement.
// Événements : upgrade_modal_shown / upgrade_modal_clicked (avec reason).
// Ce n'est pas un toast : Mode focus respecté.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useBootstrap } from "@/components/bootstrap-provider";
import { PLAN_LIMITS } from "@/lib/plans";
import { DashboardVisual, ComposerVisual, ReportVisual } from "@/components/marketing/product-visuals";
import { trackGrowthEvent } from "@/lib/growth-client";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { IconClose } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";

export type UpgradeReason = "links_limit" | "second_brand" | "retention" | "reports" | "calendar_share" | "ai_assistant" | "post_quota" | "generic";

const REASONS: Record<UpgradeReason, { title: string; lines: [string, string]; visual: "dashboard" | "composer" | "report" }> = {
  links_limit: {
    title: "Plus de liens sur votre page bio",
    lines: [`Le palier Gratuit s'arrête à ${PLAN_LIMITS.FREE.maxBioLinks} liens ; Pro en autorise ${PLAN_LIMITS.PRO.maxBioLinks}.`, "Vos liens en trop ne sont jamais supprimés : ils se réactivent dès le passage en Pro."],
    visual: "dashboard"
  },
  second_brand: {
    title: "Gérez plusieurs marques",
    lines: [`Pro permet jusqu'à ${PLAN_LIMITS.PRO.tiers[0].maxBrands} marques, chacune avec ses comptes, son calendrier et ses statistiques.`, "Vos marques supplémentaires restent visibles en lecture seule : rien n'est perdu."],
    visual: "dashboard"
  },
  retention: {
    title: "Analysez la rétention de vos vidéos",
    lines: ["La vraie courbe YouTube Analytics, et l'IA vous dit où les spectateurs décrochent et pourquoi.", "Chaque analyse vous donne des recommandations concrètes pour la prochaine vidéo."],
    visual: "report"
  },
  reports: {
    title: "Des rapports clients sans effort",
    lines: ["Vos clients reçoivent chaque semaine un rapport à jour, sans que vous ayez rien à faire.", "Une page de reporting par marque, recalculée à chaque visite, partageable par lien."],
    visual: "report"
  },
  calendar_share: {
    title: "Partagez votre calendrier avec vos clients",
    lines: ["Un lien en lecture seule : votre client voit ce qui part, et quand, sans compte à créer.", "Fini les captures d'écran et les tableaux envoyés à la main."],
    visual: "report"
  },
  ai_assistant: {
    title: "L'assistant IA, à votre service",
    lines: ["Titres, descriptions, miniatures, réponses aux commentaires : l'IA lit vos vraies données et propose.", "Elle explique le pourquoi de chaque conseil, pour que vous progressiez à chaque publication."],
    visual: "composer"
  },
  post_quota: {
    title: "Publiez sans compter",
    lines: [`Le palier Gratuit permet ${PLAN_LIMITS.FREE.maxPostsPerMonth} publications par mois et par marque ; Pro en permet ${PLAN_LIMITS.PRO.maxPostsPerMonth}.`, "Programmez tout votre mois en une fois, sur tous vos réseaux."],
    visual: "composer"
  },
  generic: {
    title: "Passez en Pro",
    lines: ["Plusieurs marques, rapports clients, calendrier partagé, assistant IA et analyse de rétention.", "Sans engagement : résiliable ou mis en pause à tout moment depuis Facturation."],
    visual: "dashboard"
  }
};

interface UpgradeModalContextValue {
  open: (reason: UpgradeReason) => void;
  close: () => void;
  /** Ouvre la modale si une réponse d'API porte une raison de palier. */
  openFromResponse: (status: number, data: unknown) => boolean;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null);

export function useUpgradeModal(): UpgradeModalContextValue {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) throw new Error("useUpgradeModal() doit être utilisé sous <UpgradeModalProvider>.");
  return ctx;
}

export function isUpgradeReason(value: unknown): value is UpgradeReason {
  return typeof value === "string" && value in REASONS;
}

function useCountdown(until: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h} h ${String(m).padStart(2, "0")} min ${String(s).padStart(2, "0")} s`;
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const { data: me, patch } = useBootstrap();
  const router = useRouter();
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const [starting, setStarting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(
    (r: UpgradeReason) => {
      setReason(r);
      trackGrowthEvent("upgrade_modal_shown", { reason: r });
      // Offre de bienvenue : le serveur décide (essai terminé, jamais
      // payant, coupon configuré) et renvoie la date d'expiration.
      if (me && !me.paid && !me.onTrial) {
        fetch("/api/billing/offer", { method: "POST" })
          .then((res) => (res.ok ? res.json() : null))
          .then((d) => {
            if (d && typeof d.offerExpiresAt !== "undefined") patch({ offerExpiresAt: d.offerExpiresAt });
          })
          .catch(() => undefined);
      }
    },
    [me, patch]
  );
  const close = useCallback(() => setReason(null), []);
  const openFromResponse = useCallback(
    (status: number, data: unknown) => {
      if ((status === 402 || status === 403) && data && typeof data === "object" && isUpgradeReason((data as { reason?: unknown }).reason)) {
        open((data as { reason: UpgradeReason }).reason);
        return true;
      }
      return false;
    },
    [open]
  );

  useEffect(() => {
    if (!reason) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [reason, close]);

  const countdown = useCountdown(me?.offerExpiresAt ?? null);
  const proTier = PLAN_LIMITS.PRO.tiers[0];

  async function goPro() {
    if (!reason) return;
    trackGrowthEvent("upgrade_modal_clicked", { reason });
    if (!me?.billingEnabled) {
      router.push("/billing");
      close();
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "PRO", interval: "month", maxBrands: proTier.maxBrands, reason })
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      router.push("/billing");
      close();
    } catch {
      router.push("/billing");
      close();
    } finally {
      setStarting(false);
    }
  }

  const value = useMemo(() => ({ open, close, openFromResponse }), [open, close, openFromResponse]);
  const def = reason ? REASONS[reason] : null;
  const Visual = def?.visual === "composer" ? ComposerVisual : def?.visual === "report" ? ReportVisual : DashboardVisual;

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      {def && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={close} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="glass-panel-solid w-full max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl"
          >
            <div className="grid sm:grid-cols-[1fr_260px]">
              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-aurora-200">
                    <UpgradeGem className="h-3.5 w-3.5" /> Pro
                  </span>
                  <button ref={closeRef} type="button" onClick={close} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white sm:hidden">
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
                <h2 id="upgrade-modal-title" className="mt-4 font-display text-2xl font-semibold leading-tight text-white">
                  {def.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{def.lines[0]}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{def.lines[1]}</p>

                <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Pro · jusqu&apos;à {proTier.maxBrands} marques</p>
                  {countdown ? (
                    <>
                      <p className="mt-1 text-2xl font-semibold text-white">
                        {(proTier.priceMonthly / 2).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €{" "}
                        <span className="text-sm font-normal text-slate-500 line-through">{proTier.priceMonthly} €</span>
                        <span className="text-sm font-normal text-slate-400"> le premier mois, puis {proTier.priceMonthly} €/mois</span>
                      </p>
                      <p className="mt-1 text-xs text-emerald-300" aria-live="polite">
                        -50 % sur votre premier mois — expire dans {countdown}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {proTier.priceMonthly} € <span className="text-sm font-normal text-slate-400">/ mois, ou {proTier.priceYearly} € / an</span>
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">Sans engagement · résiliable ou mis en pause à tout moment</p>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={goPro}
                    disabled={starting}
                    className={clsx("btn-glow inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white", starting && "opacity-60")}
                  >
                    <UpgradeGem className="h-4 w-4" /> {starting ? "Redirection…" : "Passer en Pro"}
                  </button>
                  <button type="button" onClick={close} className="text-sm text-slate-400 transition hover:text-white">
                    Plus tard
                  </button>
                </div>
              </div>
              <div className="relative hidden items-center justify-center border-l border-white/[0.06] bg-white/[0.02] p-4 sm:flex">
                <button type="button" onClick={close} aria-label="Fermer" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
                  <IconClose className="h-4 w-4" />
                </button>
                <div className="w-full scale-90">
                  <Visual />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </UpgradeModalContext.Provider>
  );
}
