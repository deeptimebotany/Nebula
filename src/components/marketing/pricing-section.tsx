"use client";

// Grille tarifaire publique — même source de vérité que la page Facturation
// (PLAN_LIMITS dans src/lib/plans.ts), pour ne jamais afficher deux grilles
// de prix différentes. Pas de paiement ici : les CTA renvoient vers
// /register, le choix précis du palier se fait après connexion.
//
// Ce qui a changé par rapport à l'ancienne version : le prix affiché n'est
// plus un simple « à partir de » ambigu — chaque plan payant montre ses
// paliers de nombre de marques (3/5/10, 15/25/50) et le prix se met à jour
// quand on en choisit un ; plus de « marques illimitées » (le plan Agence
// est plafonné à 50) ; les fonctionnalités listées viennent de plans.ts,
// sans reformulation qui exagérerait ce qui est inclus.

import { useState } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { PLAN_LIMITS, type Plan, type BillingInterval } from "@/lib/plans";
import { clsx } from "@/lib/clsx";
import { IconLock, IconSparkle } from "@/components/dashboard/icons";

const PAID_PLANS: Plan[] = ["PRO", "AGENCY"];

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-aurora-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PaidPlanCard({ planId, interval }: { planId: Plan; interval: BillingInterval }) {
  const plan = PLAN_LIMITS[planId];
  const [tierIndex, setTierIndex] = useState(0);
  const tier = plan.tiers[tierIndex];
  const price = interval === "year" ? tier.priceYearly : tier.priceMonthly;
  const perMonth = interval === "year" ? Math.round((tier.priceYearly / 12) * 100) / 100 : tier.priceMonthly;
  const highlighted = planId === "PRO";

  return (
    <GlassCard
      hover={false}
      className={clsx("relative flex h-full flex-col", highlighted && "border-aurora-400/40 shadow-glow")}
    >
      {highlighted && (
        <span className="absolute -top-3 left-5 rounded-full bg-gradient-to-r from-nebula-500 to-accent-cyan px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Le plus choisi
        </span>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg text-white">{plan.label}</p>
        <p className="text-right text-xs text-slate-500">{planId === "AGENCY" ? "Pour les agences" : "Créateurs et indépendants"}</p>
      </div>
      <p className="mt-2">
        <span className="font-display text-4xl font-semibold text-white">{price.toLocaleString("fr-FR")} €</span>
        <span className="text-sm text-slate-400"> / {interval === "year" ? "an" : "mois"}</span>
      </p>
      <p className="mt-0.5 min-h-[1rem] text-xs text-slate-500">
        {interval === "year"
          ? `soit ${perMonth.toLocaleString("fr-FR")} € par mois, facturé annuellement`
          : "facturé mensuellement, sans engagement"}
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Nombre de marques</p>
        <div
          role="radiogroup"
          aria-label={`Nombre de marques pour le palier ${plan.label}`}
          className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
        >
          {plan.tiers.map((t, i) => (
            <button
              key={t.maxBrands}
              type="button"
              role="radio"
              aria-checked={i === tierIndex}
              onClick={() => setTierIndex(i)}
              className={clsx(
                "rounded-lg px-2 py-1.5 text-xs font-medium transition",
                i === tierIndex ? "bg-white/10 text-white shadow-sm" : "text-slate-400 hover:text-white"
              )}
            >
              {t.maxBrands}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-300">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <ButtonLink href="/register" className="mt-6 w-full" variant={highlighted ? "glow" : "outline"}>
        Commencer avec {plan.label}
      </ButtonLink>
    </GlassCard>
  );
}

// showHeading=false sur la page /tarifs, qui a déjà son propre titre : on
// évite d'afficher deux introductions à la suite.
export function PricingSection({ showComparisonLink = true, showHeading = true }: { showComparisonLink?: boolean; showHeading?: boolean }) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const yearly = interval === "year";

  return (
    <section id="tarifs" className={clsx("relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6", showHeading ? "py-24" : "pb-24 pt-4")}>
      {showHeading && (
        <Reveal>
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Tarifs</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">Simple, sans surprise</h2>
            <p className="mt-3 text-base text-slate-400">
              Commencez gratuitement, sans carte bancaire. Passez à Pro ou Agence quand vous gérez plusieurs marques ou
              voulez l&apos;assistant IA et les rapports clients.
            </p>
          </div>
        </Reveal>
      )}

      <div className="mb-8 flex items-center justify-center gap-3">
        <span id="pricing-interval-label" className={clsx("text-sm", !yearly ? "text-white" : "text-slate-500")}>
          Mensuel
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          aria-label="Facturation annuelle"
          onClick={() => setInterval((v) => (v === "month" ? "year" : "month"))}
          className="relative h-7 w-14 rounded-full border border-white/10 bg-white/[0.05] transition"
        >
          <span
            className={clsx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-nebula-500 to-accent-cyan transition-all",
              yearly ? "left-[calc(100%-1.5rem)]" : "left-0.5"
            )}
          />
        </button>
        <span className={clsx("text-sm", yearly ? "text-white" : "text-slate-500")}>
          Annuel <span className="text-emerald-400">— 2 mois offerts</span>
        </span>
      </div>

      <RevealGroup className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <RevealItem>
          <GlassCard hover={false} className="flex h-full flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-lg text-white">{PLAN_LIMITS.FREE.label}</p>
              <p className="text-xs text-slate-500">Pour démarrer</p>
            </div>
            <p className="mt-2">
              <span className="font-display text-4xl font-semibold text-white">0 €</span>
              <span className="text-sm text-slate-400"> / pour toujours</span>
            </p>
            <p className="mt-0.5 min-h-[1rem] text-xs text-slate-500">sans carte bancaire</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-300">
              {PLAN_LIMITS.FREE.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-slate-500">
                <IconLock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Assistant IA, rapports et calendrier clients : à partir de Pro</span>
              </li>
            </ul>
            <ButtonLink href="/register" variant="outline" className="mt-6 w-full">
              Créer mon espace gratuitement
            </ButtonLink>
          </GlassCard>
        </RevealItem>

        {PAID_PLANS.map((planId) => (
          <RevealItem key={planId}>
            <PaidPlanCard planId={planId} interval={interval} />
          </RevealItem>
        ))}
      </RevealGroup>

      <Reveal>
        {showComparisonLink && (
          <p className="mt-8 text-center text-sm text-slate-400">
            <Link href="/tarifs" className="text-aurora-300 hover:underline">
              Voir le comparatif complet des paliers →
            </Link>
          </p>
        )}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <IconLock className="h-3.5 w-3.5" /> Paiement sécurisé par Stripe
          </span>
          <span>Résiliable à tout moment depuis votre espace</span>
          <span className="flex items-center gap-1.5">
            <IconSparkle className="h-3.5 w-3.5" /> Quotas de publication et de comptes par marque
          </span>
        </p>
      </Reveal>
    </section>
  );
}
