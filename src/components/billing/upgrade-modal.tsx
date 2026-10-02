"use client";

// Paywall contextuel (brief growth, lot G2.b) : UNE modale pour toutes les
// fonctions verrouillées, avec une raison (`reason`) qui choisit le titre,
// deux phrases de bénéfice concret, le visuel produit, le prix lu dans
// plans.ts et le bouton « Passer en Pro » (Checkout Stripe). Elle remplace
// les anciens messages « réservé aux paliers Pro/Agence » et s'ouvre :
//   - au clic sur une fonction verrouillée (page Rapports, Rétention…) ;
//   - quand une API répond 402/403 avec `reason` (openUpgradeFromResponse) ;
//   - quand la porte de l'IA refuse (lot E2, brief « Essai 14 jours ») :
//     quota de l'essai atteint (429 trial_ai_limit), budget du jour de
//     l'essai ou du Gratuit (429 trial_ai_busy / free_ai_busy), plafond par
//     connexion (429 ai_ip_limit), adresse non confirmée (403
//     email_unverified : variante sans offre, avec « Renvoyer le lien »),
//     quota du mois d'un compte payant (429 ai_monthly_limit : avis, avec
//     la recharge Rétention quand elle est proposée), âge non confirmé.
//     Le message du serveur (« Pendant l'essai, 5 miniatures en tout… En
//     Pro, 15. ») s'affiche tel quel ; le prix est lu dans plans.ts.
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
import { VerifyResendButton } from "@/components/email-verify/verify-resend-button";
import { PLAN_LIMITS } from "@/lib/plans";
import { ProductShot } from "@/components/marketing/product-shot";
import { trackGrowthEvent } from "@/lib/growth-client";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { IconClose } from "@/components/dashboard/icons";
import { clsx } from "@/lib/clsx";
import { RetentionPackButton } from "@/components/billing/retention-pack";

export type UpgradeReason =
  | "links_limit"
  | "second_brand"
  | "dormant_brand"
  | "retention"
  | "reports"
  | "calendar_share"
  | "ai_assistant"
  | "studio"
  | "media_kit"
  | "post_quota"
  | "trial_ai_limit"
  | "ai_daily_limit"
  | "ai_monthly_limit"
  | "ai_ip_limit"
  | "trial_ai_busy"
  | "free_ai_busy"
  | "email_unverified"
  | "age_unconfirmed"
  | "generic";

const PRO_AI = PLAN_LIMITS.PRO.aiMonthly;
const TRIAL_AI = PLAN_LIMITS.TRIAL.aiMonthly;
const PRO_AI_LINE = `En Pro, chaque mois : ${PRO_AI.retention} analyses Rétention, ${PRO_AI.image} miniatures, ${PRO_AI.studio} générations du Studio et ${PRO_AI.assistant} messages à l'assistant (textes : ${PLAN_LIMITS.PRO.aiDaily.text} par jour).`;

/** Raisons sans offre : un simple avis (adresse à confirmer, âge à confirmer, limite d'un compte payant). */
const NOTICE_ONLY: ReadonlySet<UpgradeReason> = new Set(["email_unverified", "age_unconfirmed"]);

const REASONS: Record<UpgradeReason, { title: string; lines: [string, string]; visual: "dashboard" | "composer" | "report" }> = {
  links_limit: {
    title: "Plus de liens sur votre page bio",
    lines: [`Le palier Gratuit s'arrête à ${PLAN_LIMITS.FREE.maxBioLinks} liens ; Pro en autorise ${PLAN_LIMITS.PRO.maxBioLinks}.`, "Vos liens en trop ne sont jamais supprimés : ils se réactivent dès le passage en Pro."],
    visual: "dashboard"
  },
  dormant_brand: {
    title: "Cette marque est en veille",
    lines: ["Depuis la fin de votre essai, une seule marque reste active en Gratuit : celle-ci est conservée telle quelle, mais ne publie plus.", "Passez en Pro pour la réactiver avec toutes ses publications, ou faites-en votre marque active."],
    visual: "dashboard"
  },
  trial_ai_limit: {
    title: "Limite de l'essai atteinte",
    lines: [`Pendant l'essai : ${TRIAL_AI.retention} analyses Rétention, ${TRIAL_AI.image} miniatures, ${TRIAL_AI.studio} générations du Studio et ${TRIAL_AI.assistant} messages à l'assistant, et ${PLAN_LIMITS.TRIAL.aiDaily.text} textes par jour.`, PRO_AI_LINE],
    visual: "composer"
  },
  ai_daily_limit: {
    title: "Limite du jour atteinte",
    lines: ["Le compteur des textes IA repart à zéro à minuit (heure de Paris).", PRO_AI_LINE],
    visual: "composer"
  },
  ai_monthly_limit: {
    title: "Quota du mois atteint",
    lines: ["Les quotas de l'IA repartent le 1er de chaque mois (heure de Paris).", PRO_AI_LINE],
    visual: "composer"
  },
  age_unconfirmed: {
    title: "Nebula est réservé aux 18 ans et plus",
    lines: ["Confirmez votre âge dans la fenêtre qui s'affiche à l'ouverture de Nebula pour utiliser l'IA.", "Si elle ne s'affiche pas, rechargez la page."],
    visual: "composer"
  },
  ai_ip_limit: {
    title: "Limite atteinte depuis cette connexion",
    lines: ["Beaucoup de générations sont déjà parties aujourd'hui depuis ce réseau. Revenez demain.", PRO_AI_LINE],
    visual: "composer"
  },
  trial_ai_busy: {
    title: "L'IA de l'essai revient à minuit",
    lines: ["L'IA de l'essai a atteint sa limite du jour. Elle revient à minuit. En Pro, elle reste disponible.", "Vos brouillons, vos réglages et vos publications programmées ne sont pas touchés."],
    visual: "composer"
  },
  free_ai_busy: {
    title: "L'IA gratuite revient à minuit",
    lines: ["L'IA gratuite a atteint sa limite du jour. Elle revient à minuit. En Pro, elle reste disponible.", "Vos brouillons, vos réglages et vos publications programmées ne sont pas touchés."],
    visual: "composer"
  },
  email_unverified: {
    title: "Confirmez votre adresse pour utiliser l'IA",
    lines: ["Pendant l'essai et en Gratuit, l'IA demande une adresse confirmée : cliquez sur le lien reçu à l'inscription.", "Rien reçu ? Vérifiez les indésirables, ou demandez un nouveau lien."],
    visual: "composer"
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
  studio: {
    title: "Le Studio IA, à partir de vos chiffres",
    lines: [
      "Des idées, des accroches et des scripts de vidéo tirés de ce qui marche déjà chez vous : vos meilleures publications, vos heures, vos courbes de rétention.",
      `${PLAN_LIMITS.PRO.aiMonthly.studio} générations par mois en Pro, ${PLAN_LIMITS.AGENCY.aiMonthly.studio} en Agence, et tout l'historique gardé.`
    ],
    visual: "composer"
  },
  media_kit: {
    title: "Votre media kit, en ligne",
    lines: [
      "Une page à envoyer aux marques et aux sponsors : vos abonnés, votre engagement et vos meilleures publications, relevés automatiquement par Nebula.",
      "Préparez-le gratuitement ; le publier (lien, PDF, image de partage) fait partie des paliers Pro et Agence."
    ],
    visual: "report"
  },
  post_quota: {
    title: "Publiez sans compter",
    lines: [`Le palier Gratuit permet ${PLAN_LIMITS.FREE.maxPostsPerMonth} publications par mois et par marque ; Pro en permet ${PLAN_LIMITS.PRO.maxPostsPerMonth}.`, "Programmez tout votre mois en une fois, sur tous vos réseaux."],
    visual: "composer"
  },
  generic: {
    title: "Passez en Pro",
    lines: ["Plusieurs marques, rapports clients, calendrier partagé, assistant IA, Studio IA et analyse de rétention.", "Sans engagement : résiliable ou mis en pause à tout moment depuis Facturation."],
    visual: "dashboard"
  }
};

interface UpgradeModalContextValue {
  /** `detail` : message précis du serveur (ex. « Pendant l'essai, 5 miniatures en tout… »). */
  open: (reason: UpgradeReason, detail?: string) => void;
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
  const [detail, setDetail] = useState<string | null>(null);
  // Refus « quota du mois » de Rétention en Pro / Agence : proposer une recharge.
  const [packOffer, setPackOffer] = useState(false);
  const [starting, setStarting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(
    (r: UpgradeReason, message?: string, retentionPack = false) => {
      setReason(r);
      setDetail(message?.trim() || null);
      setPackOffer(retentionPack);
      trackGrowthEvent("upgrade_modal_shown", { reason: r });
      // Offre de bienvenue : le serveur décide (essai terminé, jamais
      // payant, coupon configuré) et renvoie la date d'expiration.
      if (me && !me.paid && !me.onTrial && !NOTICE_ONLY.has(r)) {
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
      if ((status === 402 || status === 403 || status === 429) && data && typeof data === "object" && isUpgradeReason((data as { reason?: unknown }).reason)) {
        const d = data as { reason: UpgradeReason; error?: unknown; retentionPack?: unknown };
        // 402 : fonction absente du palier → texte de la raison ; 403/429 :
        // le message du serveur précise la limite (« Pendant l'essai, 5… »).
        open(d.reason, status !== 402 && typeof d.error === "string" ? d.error : undefined, d.retentionPack === true);
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

  // Le compte à rebours de l'offre ne tourne que modale ouverte : fermée,
  // elle ne réveille plus la page chaque seconde (audit performance, lot 4).
  const countdown = useCountdown(reason ? me?.offerExpiresAt ?? null : null);
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
  // Avis sans offre : adresse à confirmer, ou limite du jour d'un compte
  // déjà payant (Agence : rien au-dessus ; Pro : lien vers Facturation).
  const paidLimit = (reason === "ai_daily_limit" || reason === "ai_monthly_limit") && Boolean(me?.paid || me?.comp);
  const noticeOnly = Boolean(reason && (NOTICE_ONLY.has(reason) || paidLimit));
  const nextPlan = me ? PLAN_LIMITS[me.plan].upgradeTo : null;
  const paidSecondLine = reason === "ai_monthly_limit"
    ? nextPlan
      ? `Besoin de plus ? Le palier ${PLAN_LIMITS[nextPlan].label} en permet davantage chaque mois.`
      : "Merci de votre fidélité : les quotas repartent le 1er du mois."
    : nextPlan
      ? `Besoin de plus ? Le palier ${PLAN_LIMITS[nextPlan].label} en permet davantage chaque jour.`
      : "Merci de votre fidélité : le compteur repart à minuit.";
  const lines: [string, string] = def ? [detail ?? def.lines[0], paidLimit ? (packOffer ? "Les analyses achetées servent une fois le quota du mois utilisé, et n'expirent pas." : paidSecondLine) : def.lines[1]] : ["", ""];
  // Vraie capture de l'écran concerné (compte de démonstration, voir scripts/demo/).
  const shot = def?.visual === "composer" ? "publier" : def?.visual === "report" ? "rapports" : "tableau-de-bord";

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
                  {noticeOnly ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                      {reason === "email_unverified" ? "Adresse email" : reason === "age_unconfirmed" ? "Âge" : "IA"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-aurora-200">
                      <UpgradeGem className="h-3.5 w-3.5" /> Pro
                    </span>
                  )}
                  <button ref={closeRef} type="button" onClick={close} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white sm:hidden">
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
                <h2 id="upgrade-modal-title" className="mt-4 font-display text-2xl font-semibold leading-tight text-white">
                  {def.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{lines[0]}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{lines[1]}</p>

                {noticeOnly ? (
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {reason === "email_unverified" ? (
                      <>
                        <VerifyResendButton email={me?.user.email} afterSend="relancez la génération." onVerified={close} />
                      </>
                    ) : packOffer ? (
                      <RetentionPackButton variant="glow" />
                    ) : nextPlan && reason !== "age_unconfirmed" ? (
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          router.push("/billing");
                        }}
                        className="btn-glow inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white"
                      >
                        Voir le palier {PLAN_LIMITS[nextPlan].label}
                      </button>
                    ) : null}
                    <button type="button" onClick={close} className="text-sm text-slate-400 transition hover:text-white">
                      Compris
                    </button>
                  </div>
                ) : (
                <>
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
                </>
                )}
              </div>
              <div className="relative hidden items-center justify-center border-l border-white/[0.06] bg-white/[0.02] p-4 sm:flex">
                <button type="button" onClick={close} aria-label="Fermer" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white">
                  <IconClose className="h-4 w-4" />
                </button>
                <ProductShot name={shot} alt="" sizes="240px" className="w-full" />
              </div>
            </div>
          </div>
        </div>
      )}
    </UpgradeModalContext.Provider>
  );
}
