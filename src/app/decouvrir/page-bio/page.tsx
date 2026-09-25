import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";
import { FaqSection } from "@/components/marketing/faq-section";
import { TrackView } from "@/components/marketing/track-view";
import { DashboardVisual } from "@/components/marketing/product-visuals";
import { RemoteImage } from "@/components/ui/remote-image";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { getCachedPublicLinkPage } from "@/lib/link-in-bio-cache";
import { PLAN_LIMITS } from "@/lib/plans";

// Landing du badge « Propulsé par Nebula » des pages bio (brief growth,
// lot G1.a). ?via=<slug> personnalise l'en-tête avec la marque visitée
// (données déjà publiques sur /l/[slug]) ; le cookie d'attribution est posé
// par le middleware avant même l'affichage.
export const metadata: Metadata = {
  title: "Créez votre page bio gratuitement",
  description: "Une page « link in bio » prête en deux minutes, avec la programmation de vos publications et vos statistiques au même endroit. Gratuit jusqu'à 3 liens, sans carte bancaire.",
  alternates: { canonical: "/decouvrir/page-bio" }
};

export const dynamic = "force-dynamic";

const FAQ = [
  { q: "C'est vraiment gratuit ?", a: `Oui : le palier Gratuit inclut une page bio avec jusqu'à ${PLAN_LIMITS.FREE.maxBioLinks} liens, la programmation de publications et vos statistiques, sans carte bancaire. Les paliers payants ajoutent plus de liens, plusieurs marques, les rapports clients et l'assistant IA.` },
  { q: "Faut-il connecter mes réseaux pour avoir une page bio ?", a: "Non. La page bio fonctionne seule : vous ajoutez vos liens, choisissez un thème, et publiez. Connecter un réseau sert ensuite à programmer vos publications et à lire vos statistiques." },
  { q: "Puis-je importer ma page Linktree ?", a: "Oui : depuis l'onglet Page bio, collez l'adresse de votre page Linktree et Nebula récupère vos liens pour vous — vous cochez ceux à garder." }
];

export default async function DecouvrirPageBio({ searchParams }: { searchParams: { via?: string } }) {
  const via = typeof searchParams.via === "string" && /^[\w.-]{1,80}$/.test(searchParams.via) ? searchParams.via : null;
  const referrer = via ? await getCachedPublicLinkPage(via).catch(() => null) : null;

  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "page-bio", via: via ?? "", personalized: Boolean(referrer) }} />

      <div className="mx-auto max-w-2xl text-center">
        {referrer ? (
          <div className="mx-auto mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-4 text-sm text-slate-300">
            {referrer.avatarUrl ? (
              <RemoteImage src={referrer.avatarUrl} className="h-8 w-8 rounded-full" sizes="32px" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nebula-700/60 text-xs font-semibold text-white">{referrer.brandName.charAt(0).toUpperCase()}</span>
            )}
            <span>
              <span className="font-medium text-white">{referrer.brandName}</span> utilise Nebula pour sa page bio
            </span>
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Page bio</p>
        )}
        <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-5xl">Votre page bio, prête en deux minutes</h1>
        <p className="mt-4 text-base text-slate-400 sm:text-lg">
          Une page « link in bio » élégante, et au même endroit la programmation de vos publications et vos statistiques. Gratuit jusqu&apos;à {PLAN_LIMITS.FREE.maxBioLinks} liens, sans carte bancaire.
        </p>
        <div className="mt-8">
          <ButtonLink href="/register" className="w-full sm:w-auto">
            Créer ma page bio gratuitement
          </ButtonLink>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { title: "Tout au même endroit", desc: "Page bio, programmation des publications et statistiques dans un seul outil — plus de trois onglets ouverts." },
          { title: `Gratuit jusqu'à ${PLAN_LIMITS.FREE.maxBioLinks} liens`, desc: "Sans carte bancaire. Les paliers payants n'arrivent que si vous gérez plusieurs marques ou voulez les rapports clients et l'IA." },
          { title: "Prête en deux minutes", desc: "Créez votre compte, ajoutez vos liens, choisissez un thème : votre page est en ligne à l'adresse nebulahub.space/l/votre-marque." }
        ].map((b) => (
          <GlassCard key={b.title} hover={false}>
            <h2 className="font-display text-base font-medium text-white">{b.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.desc}</p>
          </GlassCard>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-4xl">
        <DashboardVisual />
      </div>

      <FaqSection items={FAQ} className="mt-20" />

      <div className="mt-14 text-center">
        <ButtonLink href="/register">Créer ma page bio gratuitement</ButtonLink>
      </div>
    </PublicShell>
  );
}
