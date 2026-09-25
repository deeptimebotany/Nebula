import type { Metadata } from "next";
import { PublicShell } from "@/components/marketing/public-shell";
import { FaqSection } from "@/components/marketing/faq-section";
import { TrackView } from "@/components/marketing/track-view";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { RemoteImage } from "@/components/ui/remote-image";
import { KitView } from "@/components/media-kit/kit-view";
import { getCachedPublicKit } from "@/lib/media-kit/cache";
import type { PublicKitData } from "@/lib/media-kit/types";

// Landing du badge « Propulsé par Nebula » des media kits (produit n°10).
// ?via=<slug> personnalise l'en-tête avec le créateur dont le kit a été vu
// (données déjà publiques sur /kit/[slug]) ; le cookie d'attribution est
// posé par le middleware avant l'affichage. L'exemple est un kit fictif,
// signalé comme tel.
export const metadata: Metadata = {
  title: "Créez votre media kit avec vos vrais chiffres",
  description: "Un media kit toujours à jour pour démarcher les marques : abonnés, engagement et meilleures publications relevés automatiquement, présentation, tarifs, PDF. Aperçu gratuit.",
  alternates: { canonical: "/decouvrir/media-kit" }
};

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const EXAMPLE: PublicKitData = {
  slug: "exemple",
  brandName: "Atelier Lune",
  logoUrl: null,
  headline: "Céramique faite main, tutoriels et coulisses d'atelier",
  about: "",
  contactEmail: null,
  offers: [
    { label: "Vidéo YouTube dédiée", price: "900 €" },
    { label: "Reel Instagram sponsorisé", price: "350 €" }
  ],
  stats: {
    accounts: [
      { id: "a", network: "YOUTUBE", name: "Atelier Lune", handle: null, avatarUrl: null, profileUrl: null, followers: 48_200, growth: { delta: 2_150, pct: 4.7, days: 30 }, medianViews: 12_400, engagementRate: 1.9, postsPerMonth: 4, measuredPosts: 12, capturedAt: null },
      { id: "b", network: "INSTAGRAM", name: "atelier.lune", handle: "@atelier.lune", avatarUrl: null, profileUrl: null, followers: 21_700, growth: { delta: 830, pct: 4, days: 30 }, medianViews: null, engagementRate: 4.3, postsPerMonth: 9.3, measuredPosts: 28, capturedAt: null }
    ],
    totals: { audience: 69_900, views90: 214_000, engagementRate: 2.7, postsPerMonth: 13.3, accounts: 2 },
    posts: [],
    postsChosen: false,
    updatedAt: new Date(Date.now() - DAY).toISOString()
  }
};

const FAQ = [
  { q: "Les chiffres peuvent-ils être modifiés ?", a: "Non. Les abonnés, les vues et l'engagement sont relevés par Nebula auprès des API officielles des réseaux, et le kit indique la date du dernier relevé. Vous choisissez les comptes et les publications affichés, et vous écrivez votre présentation et vos offres : c'est ce qui rend le kit crédible pour une marque." },
  { q: "C'est gratuit ?", a: "Vous préparez votre kit gratuitement et voyez l'aperçu avec vos vrais chiffres. Le publier (lien à partager, PDF, image de partage) fait partie des paliers Pro et Agence." },
  { q: "Quels réseaux sont pris en charge ?", a: "YouTube, Instagram, Facebook, TikTok et Bluesky, dès que le compte est connecté à Nebula. Chaque compte peut être masqué du kit d'un clic." },
  { q: "Comment l'envoyer à une marque ?", a: "Par son lien (nebulahub.space/kit/votre-marque), qui s'affiche avec une image de partage dans un e-mail ou une messagerie, ou en PDF. Vous voyez combien de fois il a été ouvert." }
];

export default async function DecouvrirMediaKit({ searchParams }: { searchParams: { via?: string } }) {
  const via = typeof searchParams.via === "string" && /^[\w.-]{1,80}$/.test(searchParams.via) ? searchParams.via : null;
  const referrer = via ? await getCachedPublicKit(via).catch(() => null) : null;

  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "media-kit", via: via ?? "", personalized: Boolean(referrer) }} />

      <div className="mx-auto max-w-2xl text-center">
        {referrer ? (
          <div className="mx-auto mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-1.5 pr-4 text-sm text-slate-300">
            {referrer.logoUrl ? (
              <RemoteImage src={referrer.logoUrl} className="h-8 w-8 rounded-full" sizes="32px" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nebula-700/60 text-xs font-semibold text-white">{referrer.brandName.charAt(0).toUpperCase()}</span>
            )}
            <span>
              <span className="font-medium text-white">{referrer.brandName}</span> présente ses chiffres avec Nebula
            </span>
          </div>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">Media kit</p>
        )}
        <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-5xl">Un media kit qui se met à jour tout seul</h1>
        <p className="mt-4 text-base text-slate-400 sm:text-lg">
          Vos abonnés, votre engagement et vos meilleures publications, relevés automatiquement auprès des réseaux. Ajoutez votre présentation et vos tarifs, envoyez le lien ou le PDF aux marques.
        </p>
        <div className="mt-8">
          <ButtonLink href="/register" className="w-full sm:w-auto">
            Préparer mon media kit
          </ButtonLink>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { title: "Des chiffres vérifiables", desc: "Relevés par Nebula via les API officielles, avec la date du dernier relevé. Vous choisissez ce qui s'affiche, pas les chiffres." },
          { title: "Un lien, un PDF", desc: "Une adresse à votre nom, une image de partage soignée dans les messageries, et une version PDF à joindre à vos e-mails." },
          { title: "Toujours à jour", desc: "Plus de captures d'écran à refaire avant chaque démarchage : le kit suit vos comptes, et vous voyez quand il est ouvert." }
        ].map((b) => (
          <GlassCard key={b.title} hover={false}>
            <h2 className="font-display text-base font-medium text-white">{b.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{b.desc}</p>
          </GlassCard>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-4xl">
        <p className="mb-3 text-center text-xs text-slate-500">Exemple de media kit (marque et chiffres fictifs)</p>
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-6">
          <KitView data={EXAMPLE} nested />
        </div>
      </div>

      <FaqSection items={FAQ} className="mt-20" />

      <div className="mt-14 text-center">
        <ButtonLink href="/register">Préparer mon media kit</ButtonLink>
      </div>
    </PublicShell>
  );
}
