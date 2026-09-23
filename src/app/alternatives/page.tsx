import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { SavingsCalculator } from "@/components/marketing/savings-calculator";
import { TrackView } from "@/components/marketing/track-view";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { COMPETITORS, formatEur, formatPrice, formatVerifiedAt, toEur } from "@/data/competitors";
import { PLAN_LIMITS } from "@/lib/plans";

// Index des pages « alternative à » (brief growth, lot G5.a).
export const metadata: Metadata = {
  title: "Alternatives : comparer Nebula aux autres planificateurs",
  description: "Hootsuite, Buffer, Later, Metricool, Swello, Agorapulse, Publer, Planoly : prix constatés, fonctions comparées et calculateur d'économies face à Nebula, en français, dès 9 € par mois.",
  alternates: { canonical: "/alternatives" }
};

export default function AlternativesIndexPage() {
  const tier0 = PLAN_LIMITS.PRO.tiers[0];
  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "alternatives" }} />
      <PublicPageHeading eyebrow="Comparatifs" title="Nebula face aux autres planificateurs" desc={<>Prix relevés sur le site de chaque éditeur, fonctions comparées point par point, et ce que Nebula ne fait pas encore. Nebula : en français, en euros, dès {tier0.priceMonthly} € par mois pour {tier0.maxBrands} marques.</>} />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COMPETITORS.map((c) => {
          const entryEur = toEur(c.entryMonthly, c.currency);
          return (
            <li key={c.slug}>
              <GlassCard hover={false} className="h-full">
                <h2 className="font-display text-lg font-semibold text-white">Alternative à {c.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{c.tagline}</p>
                <p className="mt-3 text-xs text-slate-500">
                  Prix d&apos;entrée : {formatPrice(c.entryMonthly, c.currency)}
                  {c.currency === "USD" && entryEur !== null ? ` (≈ ${formatEur(entryEur)})` : ""} par mois · constaté le {formatVerifiedAt(c.verifiedAt)}
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link href={`/alternatives/${c.slug}`} className="font-medium text-aurora-300 hover:underline">
                    Comparer →
                  </Link>
                  <Link href={`/prix/${c.slug}`} className="text-slate-400 hover:text-white hover:underline">
                    Tarifs {c.name} expliqués
                  </Link>
                </div>
              </GlassCard>
            </li>
          );
        })}
      </ul>

      <section className="mt-16">
        <SavingsCalculator />
      </section>

      <section className="mx-auto mt-16 max-w-3xl text-center">
        <p className="text-sm text-slate-400">Vous utilisez un autre outil ? Nebula importe vos publications depuis un export CSV et votre page Linktree en quelques clics.</p>
        <div className="mt-5">
          <ButtonLink href="/register?utm_source=alternatives&utm_medium=cta&utm_campaign=index">Essayer Nebula gratuitement</ButtonLink>
        </div>
      </section>
    </PublicShell>
  );
}
