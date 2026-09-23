import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { FaqSection } from "@/components/marketing/faq-section";
import { SavingsCalculator } from "@/components/marketing/savings-calculator";
import { CompetitorTable } from "@/components/marketing/competitor-table";
import { TrackView } from "@/components/marketing/track-view";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { COMPETITOR_SLUGS, UPCOMING_NETWORKS, formatEur, formatVerifiedAt, getCompetitor, nebulaEstimate, REFERENCE_SCENARIO, toEur } from "@/data/competitors";
import { PLAN_LIMITS } from "@/lib/plans";
import { TRIAL_DAYS } from "@/lib/trial";
import { NETWORKS, NETWORK_META } from "@/lib/types";

// Page « Alternative à {X} » (brief growth, lot G5.a). Contenu généré depuis
// plans.ts et src/data/competitors.ts : aucun prix en dur ici.
export function generateStaticParams() {
  return COMPETITOR_SLUGS.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const c = getCompetitor(params.slug);
  if (!c) return {};
  const tier0 = PLAN_LIMITS.PRO.tiers[0];
  return {
    title: `Alternative à ${c.name} : Nebula, en français, dès ${tier0.priceMonthly} €/mois`,
    description: `Nebula face à ${c.name} : prix constatés le ${formatVerifiedAt(c.verifiedAt)}, fonctions comparées, ce que Nebula ne fait pas encore, et calculateur d'économies. ${TRIAL_DAYS} jours de Pro offerts.`,
    alternates: { canonical: `/alternatives/${c.slug}` }
  };
}

export default function AlternativePage({ params }: { params: { slug: string } }) {
  const c = getCompetitor(params.slug);
  if (!c) notFound();
  const tier0 = PLAN_LIMITS.PRO.tiers[0];
  const ref = c.estimate(REFERENCE_SCENARIO);
  const refEur = toEur(ref.monthly, c.currency);
  const nebulaRef = nebulaEstimate(REFERENCE_SCENARIO);
  const nebulaNetworks = NETWORKS.map((n) => NETWORK_META[n].label);

  const faq = [
    { q: `Nebula remplace-t-il ${c.name} ?`, a: `Pour programmer et publier sur ${nebulaNetworks.join(", ")}, suivre vos statistiques et envoyer des rapports à vos clients : oui. ${c.name} couvre d'autres réseaux (${c.networks.filter((n) => !nebulaNetworks.some((m) => n.toLowerCase().startsWith(m.toLowerCase()))).slice(0, 4).join(", ") || "voir le tableau"}) que Nebula ne prend pas encore en charge — les listes d'attente par réseau vous préviennent dès l'ouverture.` },
    { q: "Combien coûte Nebula ?", a: `Le palier Gratuit permet de commencer sans carte bancaire (${PLAN_LIMITS.FREE.features[0]}, ${PLAN_LIMITS.FREE.features[1].toLowerCase()}). Le palier Pro coûte ${tier0.priceMonthly} € par mois pour ${tier0.maxBrands} marques (${formatEur(tier0.priceYearly)} par an, soit deux mois offerts), utilisateurs illimités. Tout nouveau compte reçoit ${TRIAL_DAYS} jours de Pro.` },
    { q: `Comment passer de ${c.name} à Nebula sans tout ressaisir ?`, a: "Exportez vos publications en CSV depuis votre outil actuel, puis importez-les dans Nebula (page Publications → Importer) : elles sont créées en brouillon avec leur date et leur texte, à vérifier avant programmation. Votre page Linktree s'importe aussi en collant son adresse." },
    { q: "Les prix indiqués sont-ils à jour ?", a: `Ils ont été relevés le ${formatVerifiedAt(c.verifiedAt)} sur le site de l'éditeur et peuvent évoluer. Vérifiez toujours la grille officielle avant de décider ; les prix de Nebula sont ceux de la page Tarifs.` }
  ];

  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "alternatives", competitor: c.slug }} />
      <PublicPageHeading eyebrow="Comparatif" title={`Alternative à ${c.name} : Nebula, en français, dès ${tier0.priceMonthly} €/mois`} desc={<>{c.name} : {c.tagline.charAt(0).toLowerCase() + c.tagline.slice(1)} Nebula planifie et publie sur {nebulaNetworks.join(", ")}, avec rapports clients, page bio et assistant IA, pour un prix qui ne dépend que du nombre de marques. Pour {REFERENCE_SCENARIO.brands} marques et {REFERENCE_SCENARIO.accounts} comptes : {refEur === null ? "tarif non publié" : `≈ ${formatEur(refEur)}`} chez {c.name}, {formatEur(nebulaRef.monthlyAnnual, 2)} chez Nebula, par mois.</>} />

      <section aria-labelledby="tableau">
        <h2 id="tableau" className="mb-4 font-display text-2xl font-semibold text-white">Point par point</h2>
        <CompetitorTable competitor={c} />
        <p className="mt-3 text-[11px] text-slate-500">Prix constatés le {formatVerifiedAt(c.verifiedAt)} sur le site de l&apos;éditeur, susceptibles d&apos;évoluer. Noms cités à titre nominatif.</p>
      </section>

      <section className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
        <GlassCard hover={false}>
          <h2 className="font-display text-xl font-semibold text-white">Ce que Nebula ne fait pas encore</h2>
          <p className="mt-2 text-sm text-slate-400">Autant le dire clairement : Nebula publie aujourd&apos;hui sur {nebulaNetworks.join(", ")}. Les réseaux suivants sont en préparation ; inscrivez-vous à la liste d&apos;attente pour être prévenu.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {UPCOMING_NETWORKS.map((n) => (
              <li key={n.slug}>
                <Link href={`/reseaux/${n.slug}`} className="inline-flex rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-300 transition hover:border-aurora-400/40 hover:text-white">
                  {n.label} — bientôt
                </Link>
              </li>
            ))}
          </ul>
          {c.features.approval === "yes" && <p className="mt-3 text-xs text-slate-500">Approbation client : incluse dans Nebula Pro (lien d&apos;approbation par publication).</p>}
        </GlassCard>
        <GlassCard hover={false}>
          <h2 className="font-display text-xl font-semibold text-white">Changer sans rien perdre</h2>
          <p className="mt-2 text-sm text-slate-400">Exportez vos publications en CSV depuis {c.name}, importez-les dans Nebula : elles arrivent en brouillon avec leur date, leur texte et leur média en référence. Vous vérifiez, puis vous programmez. Votre page de liens s&apos;importe aussi depuis Linktree.</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            <li>· Import CSV (Buffer, Metricool ou colonnes libres)</li>
            <li>· Import Linktree en collant l&apos;adresse</li>
            <li>· Rien n&apos;est programmé sans votre validation</li>
          </ul>
        </GlassCard>
      </section>

      <section className="mt-14">
        <SavingsCalculator defaultCompetitors={[c.slug, ...["metricool", "buffer", "hootsuite"].filter((s) => s !== c.slug).slice(0, 2)]} title={`Combien économiseriez-vous face à ${c.name} ?`} />
      </section>

      <div className="mt-14">
        <FaqSection items={faq} eyebrow="Questions" title={`${c.name} ou Nebula ?`} />
      </div>

      <section className="mx-auto mt-16 max-w-3xl">
        <GlassCard hover={false} className="p-8 text-center sm:p-10">
          <h2 className="font-display text-2xl font-semibold text-white">Essayez Nebula gratuitement</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">Sans carte bancaire, {TRIAL_DAYS} jours de Pro offerts. Vos publications et votre page de liens s&apos;importent en quelques minutes.</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href={`/register?utm_source=alternatives&utm_medium=cta&utm_campaign=${c.slug}`} className="w-full sm:w-auto">Créer mon espace</ButtonLink>
            <Link href={`/prix/${c.slug}`} className="text-sm text-slate-400 hover:text-white hover:underline">
              Tarifs {c.name} expliqués
            </Link>
          </div>
        </GlassCard>
      </section>
    </PublicShell>
  );
}
