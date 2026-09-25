import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicShell } from "@/components/marketing/public-shell";
import { FaqSection } from "@/components/marketing/faq-section";
import { OriginLabel, OriginTracker } from "./landing-origin";
import { ReportVisual } from "@/components/marketing/product-visuals";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { PLAN_LIMITS } from "@/lib/plans";
import { TRIAL_DAYS } from "@/lib/trial";

// Landing du badge et des blocs de conversion des pages à jeton (rapport,
// calendrier client, approbation) — brief growth, lot G1.a. Le prix Pro est
// lu dans plans.ts (seule source des tarifs).
export const metadata: Metadata = {
  title: "Rapports clients et calendrier partagé, automatiques",
  description: "Vous venez de consulter un rapport, un calendrier ou une page d'approbation générés par Nebula. Obtenez les mêmes pour vos marques : publication multi-réseaux, rapports automatiques, approbation en un clic.",
  alternates: { canonical: "/decouvrir/rapports-clients" }
};

// Page pré-générée (lot 11) : la provenance (?via, ?utm_campaign) est lue
// dans le navigateur, voir landing-origin.tsx.
export default function DecouvrirRapportsClients() {
  const proMonthly = PLAN_LIMITS.PRO.tiers[0].priceMonthly;

  const faq = [
    { q: "Mes clients doivent-ils créer un compte pour voir leurs rapports ?", a: "Non. Chaque rapport, calendrier ou page d'approbation est un lien privé que vous partagez ; votre client l'ouvre sans se connecter. Vous pouvez le dépublier à tout moment." },
    { q: "Les rapports sont-ils vraiment automatiques ?", a: "Oui : le rapport est recalculé à chaque visite à partir des vraies statistiques des comptes connectés, et peut être envoyé par email chaque semaine ou chaque mois sans intervention." },
    { q: "Combien ça coûte ?", a: `Le palier Gratuit permet de commencer sans carte bancaire. Les rapports clients et le calendrier partagé font partie du palier Pro, à partir de ${proMonthly} € par mois — et tout nouveau compte bénéficie de ${TRIAL_DAYS} jours de Pro offerts pour les essayer.` }
  ];

  return (
    <PublicShell width="max-w-5xl">
      <Suspense fallback={null}>
        <OriginTracker />
      </Suspense>

      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Vous venez de consulter{" "}
          <Suspense fallback="un rapport généré">
            <OriginLabel />
          </Suspense>{" "}
          par Nebula
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-5xl">Les mêmes rapports, pour vos propres marques</h1>
        <p className="mt-4 text-base text-slate-400 sm:text-lg">
          Rapports et calendrier client automatiques, approbation en un clic, publication sur YouTube, Instagram, Facebook et TikTok — à partir de {proMonthly} €/mois, avec {TRIAL_DAYS} jours de Pro offerts.
        </p>
        <div className="mt-8">
          <ButtonLink href="/register" className="w-full sm:w-auto">
            Essayer gratuitement
          </ButtonLink>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Rapports automatiques", desc: "Une page de reporting par marque, toujours à jour, envoyée par email chaque semaine ou chaque mois." },
          { title: "Calendrier client", desc: "Vos publications à venir, partagées en lecture seule : votre client sait ce qui part, et quand." },
          { title: "Approbation en un clic", desc: "Le client valide ou commente chaque publication depuis un lien privé, sans compte." },
          { title: "Publication multi-réseaux", desc: "Une publication, plusieurs réseaux, programmée à l'heure de la marque — avec l'IA pour les titres et miniatures." }
        ].map((b) => (
          <GlassCard key={b.title} hover={false}>
            <h2 className="font-display text-base font-medium text-white">{b.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.desc}</p>
          </GlassCard>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-4xl">
        <ReportVisual />
      </div>

      <FaqSection items={faq} className="mt-20" />

      <div className="mt-14 text-center">
        <ButtonLink href="/register">Essayer gratuitement — {TRIAL_DAYS} jours de Pro offerts</ButtonLink>
      </div>
    </PublicShell>
  );
}
