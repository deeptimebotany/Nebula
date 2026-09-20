"use client";

// Grille tarifaire publique (Landing V2) — même source de vérité que la
// page Facturation (PLAN_LIMITS), pour ne jamais afficher deux grilles de
// prix différentes. Pas de paiement ici : les CTA renvoient vers
// /register, le choix précis du palier se fait après connexion.

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { PLAN_LIMITS, type Plan, type BillingInterval } from "@/lib/plans";
import { clsx } from "@/lib/clsx";
import { IconSparkle, IconDiamond, IconUsers } from "@/components/dashboard/icons";

const PAID_PLANS: Plan[] = ["PRO", "AGENCY"];

// Fonctionnalités exclusives mises en avant explicitement, par palier
// (repris texto de PLAN_LIMITS pour rester honnête — aucune reformulation
// qui exagérerait ce qui est réellement inclus).
const HIGHLIGHTS: Record<Plan, { icon: typeof IconSparkle; text: string }[]> = {
  FREE: [],
  PRO: [
    { icon: IconSparkle, text: "Assistant IA (titres, légendes, chat)" },
    { icon: IconUsers, text: "Jusqu'à 10 marques" }
  ],
  AGENCY: [
    { icon: IconDiamond, text: "Marque blanche (votre logo, votre nom)" },
    { icon: IconUsers, text: "Marques et comptes illimités" }
  ]
};

export function PricingSection() {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
      <Reveal>
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">Une tarification claire</h2>
          <p className="mt-2 text-sm text-slate-400">
            Commencez gratuitement, passez à un palier supérieur quand vous en avez besoin — jamais l&apos;inverse.
          </p>
        </div>
      </Reveal>

      <div className="mb-8 flex items-center justify-center gap-3">
        <span className={clsx("text-sm", interval === "month" ? "text-white" : "text-slate-500")}>Mensuel</span>
        <button
          onClick={() => setInterval((v) => (v === "month" ? "year" : "month"))}
          className="relative h-7 w-14 rounded-full border border-white/10 bg-white/[0.05] transition"
          aria-label="Basculer entre facturation mensuelle et annuelle"
        >
          <span
            className={clsx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-nebula-500 to-accent-cyan transition-all",
              interval === "year" ? "left-[calc(100%-1.5rem)]" : "left-0.5"
            )}
          />
        </button>
        <span className={clsx("text-sm", interval === "year" ? "text-white" : "text-slate-500")}>
          Annuel <span className="text-emerald-400">— 2 mois offerts</span>
        </span>
      </div>

      <RevealGroup className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <RevealItem>
          <MotionGlassCard>
            <p className="font-display text-lg text-white">{PLAN_LIMITS.FREE.label}</p>
            <p className="mt-1">
              <span className="font-display text-3xl text-white">0€</span>
              <span className="text-sm text-slate-400"> / toujours</span>
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
              {PLAN_LIMITS.FREE.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <Link href="/register" className="mt-5 block">
              <Button variant="outline" className="w-full">
                Commencer gratuitement
              </Button>
            </Link>
          </MotionGlassCard>
        </RevealItem>

        {PAID_PLANS.map((planId) => {
          const p = PLAN_LIMITS[planId];
          const tier = p.tiers[0];
          const price = interval === "year" ? tier.priceYearly : tier.priceMonthly;
          return (
            <RevealItem key={planId}>
              <MotionGlassCard glow={planId === "AGENCY"} className={clsx(planId === "AGENCY" && "border-aurora-400/40")}>
                {planId === "AGENCY" && (
                  <span className="mb-2 inline-block rounded-full bg-gradient-to-r from-nebula-500 to-accent-cyan px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Pour les agences
                  </span>
                )}
                <p className="font-display text-lg text-white">{p.label}</p>
                <p className="mt-1">
                  <span className="font-display text-3xl text-white">{price}€</span>
                  <span className="text-sm text-slate-400"> / {interval === "year" ? "an" : "mois"}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">à partir de {tier.maxBrands} marques</p>

                {HIGHLIGHTS[planId].length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {HIGHLIGHTS[planId].map((h) => {
                      const Icon = h.icon;
                      return (
                        <div key={h.text} className="flex items-center gap-2 rounded-lg border border-aurora-400/20 bg-aurora-400/[0.06] px-2.5 py-1.5 text-xs text-aurora-100">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-aurora-300" /> {h.text}
                        </div>
                      );
                    })}
                  </div>
                )}

                <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>

                <Link href="/register" className="mt-5 block">
                  <Button className="w-full">Choisir {p.label}</Button>
                </Link>
              </MotionGlassCard>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </section>
  );
}
