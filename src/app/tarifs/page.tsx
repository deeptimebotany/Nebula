import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { PricingSection } from "@/components/marketing/pricing-section";
import { PricingComparison } from "@/components/marketing/pricing-comparison";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { AI_MONTHLY, PLAN_LIMITS, RETENTION_PACK, formatEuroCents } from "@/lib/plans";
import { SavingsCalculator } from "@/components/marketing/savings-calculator";
import { ExitIntentModal } from "@/components/marketing/exit-intent";
import { COMPETITORS } from "@/data/competitors";
import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd, pageMetadata, softwareApplicationLd } from "@/lib/seo";
import { SEO_PRICING } from "@/lib/seo-pages";

export const metadata = pageMetadata(SEO_PRICING);

// Questions spécifiques aux tarifs — les réponses reprennent le
// fonctionnement réel de la facturation (Stripe, plans.ts, page Facturation).
const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "Qu'est-ce qu'une « marque » ?",
    a: "Un espace de travail avec ses propres comptes connectés, son calendrier, ses statistiques, sa page link in bio et ses rapports. Un créateur qui gère sa seule présence n'a besoin que d'une marque ; une agence en crée une par client."
  },
  {
    q: "Puis-je changer de palier ou de nombre de marques plus tard ?",
    a: "Oui, à tout moment depuis la page Facturation. Le changement est géré par Stripe, qui ajuste la facturation en conséquence et vous affiche le détail avant confirmation."
  },
  {
    q: "Que se passe-t-il si j'ai plus de marques que mon nouveau palier n'en autorise ?",
    a: `Rien n'est supprimé. Vous ne pouvez simplement plus en créer de nouvelles tant que vous dépassez la limite, et l'application vous le signale clairement.`
  },
  {
    q: "L'abonnement annuel est-il vraiment moins cher ?",
    a: "Oui : l'annuel correspond à 10 mois au prix mensuel, soit deux mois offerts, facturés en une fois au début de la période."
  },
  {
    q: "Comment fonctionnent les quotas de l'IA ?",
    a: `Chaque palier inclut un nombre d'usages de l'IA par mois : en Pro, ${AI_MONTHLY.PRO.retention} analyses Rétention, ${AI_MONTHLY.PRO.image} miniatures, ${AI_MONTHLY.PRO.studio} générations du Studio et ${AI_MONTHLY.PRO.assistant} messages à l'assistant ; en Agence, ${AI_MONTHLY.AGENCY.retention}, ${AI_MONTHLY.AGENCY.image}, ${AI_MONTHLY.AGENCY.studio} et ${AI_MONTHLY.AGENCY.assistant}. Ils repartent à zéro le 1er de chaque mois, et la page Facturation affiche ce qu'il vous reste. Un appel qui échoue n'est jamais décompté. Nebula utilise les modèles récents de Google Gemini, en version payante : Google n'utilise pas vos contenus pour améliorer ses produits.`
  },
  {
    q: "Et si je n'ai plus d'analyses Rétention avant la fin du mois ?",
    a: `En Pro et en Agence, vous pouvez ajouter ${RETENTION_PACK.credits} analyses pour ${formatEuroCents(RETENTION_PACK.priceCents)}, en paiement unique. Elles servent une fois le quota du mois utilisé et n'expirent pas. Relancer l'analyse d'une vidéo déjà analysée n'est pas nécessaire : Nebula garde le résultat.`
  },
  {
    q: "Comment se passe le paiement ?",
    a: "Par carte bancaire via Stripe, sur une page de paiement sécurisée. Nebula ne voit ni ne stocke votre numéro de carte. Vos factures sont disponibles depuis le portail Stripe accessible dans Facturation."
  },
  {
    q: "Comment résilier ?",
    a: "Depuis la page Facturation, via le portail de gestion Stripe, en quelques clics. L'abonnement reste actif jusqu'à la fin de la période déjà payée, puis le compte repasse en palier Gratuit sans rien perdre : vos publications, comptes et statistiques restent accessibles dans les limites du Gratuit."
  }
];

export default function TarifsPage() {
  return (
    <PublicShell>
      <JsonLd
        nodes={[
          softwareApplicationLd(),
          breadcrumbLd([
            ["Accueil", "/"],
            ["Tarifs", "/tarifs"]
          ])
        ]}
      />
      <PublicPageHeading
        eyebrow="Tarifs"
        title="Un prix clair, qui suit votre activité"
        desc={
          <>
            Commencez gratuitement avec {PLAN_LIMITS.FREE.features[0].toLowerCase()} et{" "}
            {PLAN_LIMITS.FREE.features[1].toLowerCase()}. Passez à Pro ou Agence quand vous gérez plusieurs marques,
            ou pour l&apos;assistant IA et les rapports clients. Le prix dépend uniquement du nombre de marques.
          </>
        }
      />

      <div className="-mx-6 -mt-6">
        <PricingSection showComparisonLink={false} showHeading={false} />
      </div>

      {/* Maillage vers les comparatifs (brief growth, lot G5.a) */}
      <p className="-mt-4 text-center text-sm text-slate-400">
        Comparer avec…{" "}
        {COMPETITORS.slice(0, 4).map((c, i) => (
          <span key={c.slug}>
            {i > 0 && " · "}
            <Link href={`/alternatives/${c.slug}`} className="text-aurora-300 underline-offset-2 hover:underline">
              {c.name}
            </Link>
          </span>
        ))}{" "}
        ·{" "}
        <Link href="/alternatives" className="text-slate-300 underline-offset-2 hover:underline">
          tous les comparatifs
        </Link>
      </p>

      <section className="mt-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Comparatif</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-white">Ce que chaque palier inclut</h2>
        </div>
        <PricingComparison />
      </section>

      <section id="economies" className="mx-auto mt-20 max-w-4xl scroll-mt-24">
        <SavingsCalculator />
      </section>

      <section id="faq-tarifs" className="mx-auto mt-24 max-w-3xl scroll-mt-24">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Questions sur les tarifs</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-white">Avant de choisir</h2>
        </div>
        <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.02]">
          {PRICING_FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4 open:bg-white/[0.02]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition group-open:rotate-45 group-open:text-white">
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-400">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-3xl">
        <GlassCard hover={false} className="p-8 text-center sm:p-10">
          <h2 className="font-display text-2xl font-semibold text-white">Une question avant de vous lancer ?</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">
            Écrivez-nous : nous répondons à chaque message, y compris pour vous conseiller le palier le plus adapté à
            votre situation.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/register" className="w-full sm:w-auto">
              Créer mon espace gratuitement
            </ButtonLink>
            <ButtonLink href="/contact" variant="outline" className="w-full sm:w-auto">
              Nous contacter
            </ButtonLink>
          </div>
        </GlassCard>
      </section>

      <ExitIntentModal page="tarifs" />
    </PublicShell>
  );
}
