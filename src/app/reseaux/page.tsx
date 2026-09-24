import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { TrackView } from "@/components/marketing/track-view";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { UPCOMING_NETWORKS } from "@/data/competitors";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";

// Index des réseaux (brief growth, lot G5.d) : pris en charge aujourd'hui,
// et à venir avec leur liste d'attente.
export const metadata: Metadata = {
  title: "Réseaux pris en charge et à venir",
  description: "Nebula publie sur Instagram, TikTok, YouTube, Facebook et Bluesky. Threads, LinkedIn et Pinterest arrivent : inscrivez-vous pour être prévenu.",
  alternates: { canonical: "/reseaux" }
};

export default function ReseauxIndexPage() {
  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "reseaux" }} />
      <PublicPageHeading eyebrow="Réseaux" title="Où Nebula publie, et où il publiera bientôt" desc="Un seul espace pour programmer, publier et mesurer. Voici la liste exacte des réseaux pris en charge aujourd'hui — et ceux en préparation, avec une liste d'attente pour être prévenu le jour même." />

      <section aria-labelledby="supportes">
        <h2 id="supportes" className="mb-4 font-display text-2xl font-semibold text-white">Pris en charge aujourd&apos;hui</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {LAUNCHED_NETWORKS.map((n) => (
            <li key={n}>
              <GlassCard hover={false} className="h-full text-center">
                <p className="font-display text-lg font-semibold" style={{ color: NETWORK_META[n].color }}>
                  {NETWORK_META[n].label}
                </p>
                <p className="mt-1 text-xs text-slate-400">Publication, programmation, statistiques</p>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="bientot" className="mt-14">
        <h2 id="bientot" className="mb-4 font-display text-2xl font-semibold text-white">Bientôt</h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {UPCOMING_NETWORKS.map((n) => (
            <li key={n.slug}>
              <GlassCard hover={false} className="h-full">
                <h3 className="font-display text-lg font-semibold text-white">{n.label}</h3>
                <p className="mt-1 text-sm text-slate-400">{n.blurb}</p>
                <Link href={`/reseaux/${n.slug}`} className="mt-3 inline-block text-sm font-medium text-aurora-300 hover:underline">
                  Être prévenu →
                </Link>
              </GlassCard>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto mt-16 max-w-3xl text-center">
        <p className="text-sm text-slate-400">Vos réseaux sont déjà dans la liste ? Commencez maintenant, gratuitement.</p>
        <div className="mt-5">
          <ButtonLink href="/register?utm_source=reseaux&utm_medium=cta&utm_campaign=index">Créer mon espace</ButtonLink>
        </div>
      </section>
    </PublicShell>
  );
}
