"use client";

// Offres fondateurs dans l'application (02/10/2026, voir
// src/lib/billing/founders.ts) :
//   - FounderMonthlyChoice : sous Pro 1 marque (mensuel) dans Abonnement,
//     la case « Offre Fondateur : 10 € pendant 3 mois » (cochée par défaut) ;
//   - FounderPremiumCard : « Fondateur Premium », 100 € une fois, Pro
//     1 marque pendant 1 an, sans renouvellement ; fenêtre de confirmation
//     avec la renonciation au droit de rétractation (accès immédiat) ;
// La question de fin d'année Premium est dans founder-end-modal.tsx (chargée
// sur toutes les pages de l'application, donc à part).
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { FounderBadge } from "@/components/reussites/founder-badge";
import { PLAN_LIMITS, upToBrandsText } from "@/lib/plans";
import { FOUNDERS_SALE_END_LABEL, FOUNDER_MONTHLY, FOUNDER_PREMIUM, euros, placesText, type FoundersResponse } from "@/lib/founders-offer";
import { clsx } from "@/lib/clsx";

function frDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Places et droits du compte (rechargés après un achat). */
export function useFounders(): { founders: FoundersResponse | null; refresh: () => void } {
  const [founders, setFounders] = useState<FoundersResponse | null>(null);
  const refresh = useCallback(() => {
    fetch("/api/billing/founders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FoundersResponse | null) => d && setFounders(d))
      .catch(() => undefined);
  }, []);
  useEffect(() => refresh(), [refresh]);
  return { founders, refresh };
}

/** Case « Offre Fondateur » sous Pro 1 marque, en mensuel. */
export function FounderMonthlyChoice({ founders, checked, onChange }: { founders: FoundersResponse; checked: boolean; onChange: (v: boolean) => void }) {
  const m = founders.monthly;
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-aurora-400/30 bg-aurora-400/[0.06] p-3 text-xs text-slate-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-aurora-500" />
      <span>
        <strong className="text-white">Offre Fondateur</strong> : {m.priceMonthly} € par mois pendant {m.months} mois, puis {m.regularPrice} €, prélevé
        automatiquement, sans engagement. Badge « Fondateur » à vie.{" "}
        <span className="text-aurora-200">
          {placesText(m.left)} sur {m.total}, jusqu&apos;au {FOUNDERS_SALE_END_LABEL}.
        </span>
      </span>
    </label>
  );
}

/** Carte « Fondateur Premium » (Abonnement). */
export function FounderPremiumCard({ founders }: { founders: FoundersResponse }) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = founders.premium;
  const me = founders.me;
  const price = euros(p.priceCents);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/founder-premium", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waiveWithdrawal: agreed }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) {
        window.location.assign(d.url);
        return;
      }
      setError(typeof d.error === "string" ? d.error : "Le paiement n'a pas pu s'ouvrir. Réessayez dans un instant.");
    } catch {
      setError("Le paiement n'a pas pu s'ouvrir. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard hover={false} className="border-aurora-400/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="flex flex-wrap items-center gap-2">
            <span id="founder-premium-title" className="font-display text-lg text-white">
              Fondateur Premium
            </span>
            <FounderBadge />
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {price} en une fois : {PLAN_LIMITS.PRO.label} {upToBrandsText(FOUNDER_PREMIUM.maxBrands)} pendant {p.months} mois pour soutenir Nebula dès le
            lancement. Sans renouvellement automatique : un mois avant la fin, nous vous demandons quel forfait il vous faut.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {!me?.premiumUntil && (
              <>
                <span className="text-aurora-200">
                  {placesText(p.left)} sur {p.total}, jusqu&apos;au {FOUNDERS_SALE_END_LABEL}
                </span>{" "}
                ·{" "}
              </>
            )}
            badge « Fondateur » à vie, dans la Communauté et sur votre carte de créateur.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-3xl text-white">{price}</p>
          <p className="text-xs text-slate-400">une fois · soit {euros(Math.round(p.priceCents / p.months))} par mois</p>
        </div>
      </div>
      {me?.premiumUntil ? (
        <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] px-3.5 py-2.5 text-sm text-emerald-100">
          Vous êtes Fondateur Premium jusqu&apos;au {frDate(me.premiumUntil)}. Merci !
        </p>
      ) : me?.premiumEligible ? (
        <Button type="button" variant="glow" className="mt-4" onClick={() => setOpen(true)}>
          Devenir Fondateur Premium
        </Button>
      ) : (
        <p className="mt-4 text-sm text-slate-400">{me?.premiumBlocked ?? (founders.open ? "Connectez-vous pour en profiter." : "Les paiements ne sont pas encore ouverts.")}</p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Fondateur Premium">
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            <strong className="text-white">{price}</strong>, paiement unique. {PLAN_LIMITS.PRO.label} {upToBrandsText(FOUNDER_PREMIUM.maxBrands)} est actif tout
            de suite, pendant {p.months} mois. <strong className="text-white">Rien ne sera prélevé ensuite</strong> : un mois puis une semaine avant la fin,
            nous vous prévenons ; sans nouveau choix, vous repassez au palier Gratuit, sans rien perdre.
          </p>
          <p className="text-xs text-slate-400">Facture envoyée par Stripe. Une seule fois par compte, réservé aux comptes sans abonnement en cours.</p>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-aurora-500" />
            <span>
              Je veux profiter de Pro tout de suite : je demande l&apos;accès immédiat et je renonce à mon droit de rétractation de 14 jours.
            </span>
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="button" onClick={buy} disabled={!agreed || busy} className={clsx((!agreed || busy) && "opacity-60")}>
              {busy ? "Redirection…" : `Payer ${price}`}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400 transition hover:text-white">
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </GlassCard>
  );
}

/** Le palier mensuel « Fondateur » s'applique-t-il à ce choix dans Abonnement ? */
export function founderMonthlyApplies(founders: FoundersResponse | null, plan: string, maxBrands: number, interval: string): boolean {
  return Boolean(founders?.me?.monthlyEligible && founders.monthly.left > 0 && plan === FOUNDER_MONTHLY.plan && maxBrands === FOUNDER_MONTHLY.maxBrands && interval === "month");
}
