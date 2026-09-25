import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { FaqSection } from "@/components/marketing/faq-section";
import { TrackView } from "@/components/marketing/track-view";
import { NetworkWaitlistForm } from "@/components/marketing/network-waitlist-form";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { UPCOMING_NETWORKS } from "@/data/competitors";
import { PLAN_LIMITS } from "@/lib/plans";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";

// Page d'attente d'un réseau à venir (brief growth, lot G5.d).
// Pages pré-générées (lot 11) : une adresse hors de la liste répond 404
// directement, sans rendu à la demande.
export const dynamicParams = false;

export function generateStaticParams() {
  return UPCOMING_NETWORKS.map((n) => ({ slug: n.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const n = UPCOMING_NETWORKS.find((x) => x.slug === params.slug);
  if (!n) return {};
  return {
    title: `Programmer des publications ${n.label} avec Nebula — bientôt`,
    description: `${n.label} arrive dans Nebula. Inscrivez-vous pour être prévenu, et commencez dès aujourd'hui sur Instagram, TikTok, YouTube, Facebook et Bluesky.`,
    alternates: { canonical: `/reseaux/${n.slug}` }
  };
}

export default function ReseauPage({ params }: { params: { slug: string } }) {
  const n = UPCOMING_NETWORKS.find((x) => x.slug === params.slug);
  if (!n) notFound();
  const supported = LAUNCHED_NETWORKS.map((k) => NETWORK_META[k].label);
  const faq = [
    { q: `Quand ${n.label} sera-t-il disponible ?`, a: `Nous ne donnons pas de date tant qu'elle n'est pas sûre : l'accès aux API de publication de ${n.label} et leur validation prennent du temps. La liste d'attente est le seul canal d'annonce ; vous recevrez un email le jour de l'ouverture.` },
    { q: "Que puis-je faire en attendant ?", a: `Tout le reste : programmer et publier sur ${supported.join(", ")}, suivre vos statistiques, envoyer des rapports à vos clients, créer votre page « link in bio ». Le palier Gratuit n'a pas de limite de durée.` },
    { q: "Mon email sera-t-il utilisé pour autre chose ?", a: "Non. Sans la case facultative, vous ne recevrez qu'un seul email : celui de l'annonce. Aucune revente, aucune relance." }
  ];

  return (
    <PublicShell width="max-w-4xl">
      <TrackView name="landing_view" meta={{ landing: "reseaux", network: n.slug }} />
      <PublicPageHeading eyebrow="Bientôt" title={`Programmer des publications ${n.label} avec Nebula — bientôt`} desc={<>{n.blurb} {n.label} fait partie des prochains réseaux de Nebula. Laissez votre email pour être prévenu le jour de l&apos;ouverture — et commencez dès maintenant sur {supported.join(", ")}.</>} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.1fr_1fr]">
        <NetworkWaitlistForm network={n.slug} label={n.label} />
        <GlassCard hover={false}>
          <h2 className="font-display text-lg font-semibold text-white">Ce qui fonctionne déjà</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            {PLAN_LIMITS.FREE.features.map((f) => (
              <li key={f}>· {f}</li>
            ))}
            <li>· Assistant IA, rapports clients et rétention en Pro</li>
          </ul>
          <div className="mt-4">
            <ButtonLink href={`/register?utm_source=reseaux&utm_medium=cta&utm_campaign=${n.slug}`} variant="outline" className="w-full">
              Créer mon espace gratuit
            </ButtonLink>
          </div>
        </GlassCard>
      </div>

      <div className="mt-14">
        <FaqSection items={faq} eyebrow="Questions" title={`${n.label} et Nebula`} />
      </div>

      <p className="mt-10 text-center text-sm text-slate-500">
        Autres réseaux à venir :{" "}
        {UPCOMING_NETWORKS.filter((x) => x.slug !== n.slug).map((x, i) => (
          <span key={x.slug}>
            {i > 0 && " · "}
            <Link href={`/reseaux/${x.slug}`} className="text-slate-300 hover:text-white hover:underline">
              {x.label}
            </Link>
          </span>
        ))}
      </p>
    </PublicShell>
  );
}
