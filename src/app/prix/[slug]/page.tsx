import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { FaqSection } from "@/components/marketing/faq-section";
import { SavingsCalculator } from "@/components/marketing/savings-calculator";
import { TrackView } from "@/components/marketing/track-view";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { COMPETITOR_SLUGS, FX_NOTE, formatEur, formatPrice, formatVerifiedAt, getCompetitor, nebulaEstimate, REFERENCE_SCENARIO, toEur } from "@/data/competitors";
import { PLAN_LIMITS } from "@/lib/plans";
import { TRIAL_DAYS } from "@/lib/trial";

// Page « {X} : tarifs {année} expliqués » (brief growth, lot G5.a) — le
// préfixe /tarifs étant celui de Nebula, ces pages vivent sous /prix.
export function generateStaticParams() {
  return COMPETITOR_SLUGS.map((slug) => ({ slug }));
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = getCompetitor(params.slug);
  if (!c) return {};
  return {
    title: `${c.name} : tarifs ${yearOf(c.verifiedAt)} expliqués`,
    description: `Grille officielle de ${c.name} résumée, ce qui n'est pas inclus, coût réel pour 3 marques et 8 comptes, et comparaison avec Nebula. Prix constatés le ${formatVerifiedAt(c.verifiedAt)}.`,
    alternates: { canonical: `/prix/${c.slug}` }
  };
}

export default function PrixPage({ params }: { params: { slug: string } }) {
  const c = getCompetitor(params.slug);
  if (!c) notFound();
  const tier0 = PLAN_LIMITS.PRO.tiers[0];
  const ref = c.estimate(REFERENCE_SCENARIO);
  const refEur = toEur(ref.monthly, c.currency);
  const nebulaRef = nebulaEstimate(REFERENCE_SCENARIO);
  const year = yearOf(c.verifiedAt);

  const faq = [
    { q: `Quel est le prix le plus bas chez ${c.name} ?`, a: c.entryMonthly === null ? `${c.name} ne publie pas de prix d'entrée : le tarif est sur devis.` : `${c.entryLabel}. ${c.freePlan ? `Un plan gratuit existe : ${c.freePlan}.` : "Il n'y a pas de plan gratuit permanent."}` },
    { q: `Combien coûte ${c.name} pour 3 marques et 8 comptes ?`, a: refEur === null ? `${ref.how}` : `Environ ${formatPrice(ref.monthly, c.currency)} par mois en facturation annuelle${c.currency === "USD" ? ` (≈ ${formatEur(refEur)})` : ""} : ${ref.how} Chez Nebula, la même configuration coûte ${formatEur(nebulaRef.monthlyAnnual, 2)} par mois (${nebulaRef.how})` },
    { q: "Ces prix sont-ils garantis ?", a: `Non : ils ont été relevés le ${formatVerifiedAt(c.verifiedAt)} sur le site de l'éditeur et peuvent changer à tout moment. Cette page est un résumé pour vous aider à comparer, pas une offre.` }
  ];

  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "prix", competitor: c.slug }} />
      <PublicPageHeading eyebrow="Tarifs expliqués" title={`${c.name} : tarifs ${year} expliqués`} desc={<>{c.tagline} Voici sa grille officielle résumée, ce qu&apos;elle n&apos;inclut pas, et ce que coûte réellement une configuration courante — face à Nebula, {tier0.priceMonthly} € par mois pour {tier0.maxBrands} marques.</>} />

      <section aria-labelledby="grille">
        <h2 id="grille" className="mb-4 font-display text-2xl font-semibold text-white">La grille officielle, résumée</h2>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-semibold">Palier</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Par mois (annuel)</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Par mois (mensuel)</th>
                <th scope="col" className="px-4 py-3 font-semibold">Ce qu&apos;il comprend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {c.plans.map((p) => (
                <tr key={p.name}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-white">{p.name}</th>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-200">{formatPrice(p.monthlyAnnual, c.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{formatPrice(p.monthlyMonthly, c.currency)}</td>
                  <td className="px-4 py-3 text-slate-400">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Prix constatés le {formatVerifiedAt(c.verifiedAt)} sur{" "}
          <a href={c.pricingUrl} rel="nofollow noopener noreferrer" target="_blank" className="underline-offset-2 hover:text-slate-300 hover:underline">
            le site de l&apos;éditeur
          </a>
          , susceptibles d&apos;évoluer. {c.currency === "USD" ? FX_NOTE : ""}
        </p>
      </section>

      <section className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
        <GlassCard hover={false}>
          <h2 className="font-display text-xl font-semibold text-white">Ce qui n&apos;est pas inclus</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {c.notIncluded.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard hover={false}>
          <h2 className="font-display text-xl font-semibold text-white">Coût réel pour {REFERENCE_SCENARIO.brands} marques et {REFERENCE_SCENARIO.accounts} comptes</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <dt className="text-xs text-slate-400">{c.name}</dt>
              <dd className="mt-1 font-display text-xl text-white">{refEur === null ? "Non publié" : `≈ ${formatEur(refEur)} / mois`}</dd>
              <dd className="mt-1 text-xs text-slate-500">{ref.how}</dd>
            </div>
            <div className="rounded-xl border border-aurora-400/30 bg-aurora-400/[0.06] px-4 py-3">
              <dt className="text-xs text-aurora-200">Nebula</dt>
              <dd className="mt-1 font-display text-xl text-white">{formatEur(nebulaRef.monthlyAnnual, 2)} / mois</dd>
              <dd className="mt-1 text-xs text-aurora-200/80">{nebulaRef.how}</dd>
            </div>
          </dl>
        </GlassCard>
      </section>

      <section className="mt-14">
        <SavingsCalculator defaultCompetitors={[c.slug, ...["metricool", "buffer", "hootsuite"].filter((s) => s !== c.slug).slice(0, 2)]} title={`${c.name} ou Nebula : pour votre configuration`} />
      </section>

      <div className="mt-14">
        <FaqSection items={faq} eyebrow="Questions" title={`Tarifs ${c.name} : ce qu'il faut savoir`} />
      </div>

      <section className="mx-auto mt-16 max-w-3xl">
        <GlassCard hover={false} className="p-8 text-center sm:p-10">
          <h2 className="font-display text-2xl font-semibold text-white">Comparer point par point</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">Fonctions, réseaux, langue, ce que Nebula ne fait pas encore : la page « Alternative à {c.name} » détaille tout. Et {TRIAL_DAYS} jours de Pro sont offerts pour vous faire votre avis.</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href={`/alternatives/${c.slug}`} className="w-full sm:w-auto">Alternative à {c.name}</ButtonLink>
            <Link href={`/register?utm_source=prix&utm_medium=cta&utm_campaign=${c.slug}`} className="text-sm text-slate-400 hover:text-white hover:underline">
              Essayer Nebula gratuitement
            </Link>
          </div>
        </GlassCard>
      </section>
    </PublicShell>
  );
}
