import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Hero } from "@/components/marketing/hero";
import { PricingSection } from "@/components/marketing/pricing-section";
import { Faq } from "@/components/marketing/faq";
import { ComposerVisual, ReportVisual } from "@/components/marketing/product-visuals";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import {
  IconBioLink,
  IconCalendar,
  IconCalendarShare,
  IconChart,
  IconDownload,
  IconLayers,
  IconLink,
  IconLock,
  IconReport,
  IconRetention,
  IconShield,
  IconSparkle,
  IconUpload,
  IconUsers
} from "@/components/dashboard/icons";

// L'accueil garde le titre par défaut du site (voir layout.tsx) et déclare
// son adresse canonique : c'est LA page à référencer.
export const metadata: Metadata = {
  alternates: { canonical: "/" }
};

// Étapes, fonctionnalités et arguments de confiance : tout ce qui est
// affiché ici correspond à une fonction réellement présente dans
// l'application (voir src/lib/plans.ts pour les quotas, /accounts pour
// l'OAuth, /reports et /calendar-share pour les pages clients, Paramètres
// pour l'export et la suppression du compte). Aucun témoignage ni chiffre
// d'usage : il n'y en a pas encore de réels, on n'en invente pas.
const STEPS = [
  {
    icon: IconLink,
    title: "Connectez vos comptes",
    desc: "Instagram, TikTok, YouTube, Facebook — via la connexion officielle de chaque plateforme, en deux clics. Plusieurs comptes par réseau, plusieurs marques si besoin."
  },
  {
    icon: IconUpload,
    title: "Créez et programmez",
    desc: "Un média, un titre, une description : adaptez le texte par réseau si vous le souhaitez, choisissez les comptes cibles et la date. Nebula publie à l'heure prévue."
  },
  {
    icon: IconChart,
    title: "Analysez et partagez",
    desc: "Abonnés, portée, engagement, meilleurs créneaux : tout au même endroit. Envoyez à vos clients un rapport et un calendrier consultables par simple lien."
  }
];

const FEATURES = [
  {
    icon: IconCalendar,
    title: "Calendrier éditorial",
    desc: "Vue semaine ou mois, glisser-déposer pour reprogrammer, brouillons, duplication en un clic d'une publication à retenter."
  },
  {
    icon: IconLayers,
    title: "Multi-marques, multi-comptes",
    desc: "Chaque marque a ses comptes, son calendrier et ses statistiques. Basculez de l'une à l'autre sans vous déconnecter."
  },
  {
    icon: IconChart,
    title: "Analytics unifiées",
    desc: "Historique d'abonnés, portée, impressions et taux d'engagement par compte, plus le meilleur créneau de publication calculé sur vos propres données."
  },
  {
    icon: IconSparkle,
    title: "Assistant IA",
    desc: "Titres et légendes adaptés à chaque réseau, idées de contenu, chat qui répond à partir de vos vraies statistiques. Optionnel, dès le palier Pro."
  },
  {
    icon: IconRetention,
    title: "Analyse de rétention vidéo",
    desc: "Pour vos vidéos YouTube : la courbe de rétention réelle, les moments où le public décroche, et des pistes concrètes pour la prochaine."
  },
  {
    icon: IconBioLink,
    title: "Page « link in bio »",
    desc: "Une page publique par marque, à mettre dans vos bios, avec vos liens et vos couleurs — sans outil supplémentaire."
  }
];

const TRUST = [
  {
    icon: IconLock,
    title: "Connexion officielle",
    desc: "Vos comptes sont reliés par l'autorisation officielle de chaque réseau (OAuth). Votre mot de passe Instagram, TikTok ou Google n'est jamais saisi dans Nebula."
  },
  {
    icon: IconShield,
    title: "Accès révocable",
    desc: "Déconnectez un compte à tout moment depuis Nebula ou depuis le réseau lui-même : l'autorisation est immédiatement retirée."
  },
  {
    icon: IconDownload,
    title: "Vos données vous appartiennent",
    desc: "Exportez vos publications, comptes et statistiques depuis les Paramètres, et supprimez votre compte en un clic si vous le souhaitez."
  },
  {
    icon: IconUsers,
    title: "Vos clients ne voient que l'essentiel",
    desc: "Rapports et calendriers partagés par lien privé, en lecture seule. Aucun accès à votre espace, aucun compte à créer pour eux."
  }
];

function SectionHeading({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
      {desc && <p className="mt-3 text-base text-slate-400">{desc}</p>}
    </div>
  );
}

// Composant serveur : si une session valide existe déjà (cookie persistant,
// voir src/lib/auth.ts), on saute directement au tableau de bord au lieu de
// réafficher la page marketing à chaque ouverture du site.
export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/dashboard");

  return (
    <>
      <MarketingNav />
      <main id="contenu" className="relative overflow-hidden">
        {/* Fond commun à toute la page : étoiles très discrètes + deux halos
            bas de page, pour que les sections après le hero ne tombent pas
            sur un noir plat. */}
        <div aria-hidden="true" className="hero-stars pointer-events-none absolute inset-0 opacity-30" />
        <div aria-hidden="true" className="hero-orb pointer-events-none -left-32 top-[38%] h-[420px] w-[420px] bg-nebula-500/20" />
        <div aria-hidden="true" className="hero-orb hero-orb-b pointer-events-none -right-32 top-[72%] h-[460px] w-[460px] bg-accent-violet/20" />
        <Hero />

        {/* Comment ça marche */}
        <section id="comment-ca-marche" className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <SectionHeading
              eyebrow="Comment ça marche"
              title="Trois étapes, un seul espace"
              desc="De la connexion de vos comptes au rapport envoyé à vos clients, sans changer d'outil."
            />
          </Reveal>
          <RevealGroup className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <RevealItem key={step.title}>
                <GlassCard hover={false} className="relative h-full">
                  <span className="absolute right-5 top-4 font-display text-4xl font-semibold text-white/[0.06]">0{i + 1}</span>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aurora-400/30 bg-aurora-400/10 text-aurora-300">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-medium text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.desc}</p>
                </GlassCard>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-8 pb-24">
          <Reveal>
            <SectionHeading
              eyebrow="Fonctionnalités"
              title="Tout ce qu'il faut pour publier sérieusement"
              desc="Pensé pour les créateurs qui veulent gagner du temps et les agences qui doivent rendre des comptes."
            />
          </Reveal>

          <Reveal>
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div className="order-2 lg:order-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aurora-400/30 bg-aurora-400/10 text-aurora-300">
                  <IconUpload className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-white">Une publication, tous vos réseaux</h3>
                <p className="mt-3 text-base leading-relaxed text-slate-400">
                  Importez un média, écrivez une fois, puis cochez les comptes à cibler : Nebula adapte la publication
                  aux contraintes de chaque réseau (formats, longueur des textes) et l&apos;envoie à l&apos;heure prévue.
                  Une publication reste bloquée ? Dupliquez-la en un clic pour la retenter.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {[
                    "Texte commun, ou adapté réseau par réseau",
                    "Programmation à la date et à l'heure de votre choix",
                    "Suggestions IA pour les titres et légendes (Pro)",
                    "Publication en masse d'une vidéo vers tous les comptes (Agence)"
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="order-1 lg:order-2">
                <ComposerVisual />
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-20">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <ReportVisual />
              </div>
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aurora-400/30 bg-aurora-400/10 text-aurora-300">
                  <IconReport className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold text-white">Des rapports que vos clients comprennent</h3>
                <p className="mt-3 text-base leading-relaxed text-slate-400">
                  Pour chaque marque, une page de rapport à jour à chaque visite — abonnés, croissance, engagement,
                  publications de la période — partagée par un simple lien, avec envoi automatique par email chaque
                  semaine ou chaque mois si vous le souhaitez. Et un calendrier client en lecture seule pour montrer ce
                  qui arrive.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {[
                    "Chiffres recalculés en direct, jamais un instantané figé",
                    "Aucun compte à créer pour vos clients",
                    "Envoi hebdomadaire ou mensuel automatique",
                    "Calendrier des publications à venir, partageable"
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <IconCalendarShare className="mt-0.5 h-4 w-4 shrink-0 text-aurora-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          <RevealGroup className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <RevealItem key={f.title}>
                <GlassCard className="h-full">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-aurora-300">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-medium text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
                </GlassCard>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* Confiance */}
        <section id="confiance" className="relative z-10 border-y border-white/[0.06] bg-white/[0.015] py-24">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal>
              <SectionHeading
                eyebrow="Confiance"
                title="Vos comptes restent les vôtres"
                desc="Nebula s'appuie uniquement sur les autorisations officielles des réseaux et ne garde que ce qui sert à publier et à mesurer."
              />
            </Reveal>
            <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map((t) => (
                <RevealItem key={t.title}>
                  <div className="h-full rounded-2xl border border-white/[0.06] p-5">
                    <t.icon className="h-6 w-6 text-aurora-300" />
                    <h3 className="mt-4 text-base font-medium text-white">{t.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.desc}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        <PricingSection />

        <Faq />

        {/* Appel final */}
        <section className="relative z-10 mx-auto max-w-4xl px-6 pb-28">
          <Reveal>
            <GlassCard hover={false} className="relative overflow-hidden p-10 text-center sm:p-14">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-aurora-400/15 blur-3xl"
              />
              <h2 className="relative font-display text-3xl font-semibold text-white sm:text-4xl">
                Prêt à reprendre la main sur vos réseaux ?
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl text-base text-slate-400">
                Créez votre espace en une minute, connectez votre premier compte et programmez votre première
                publication. Gratuit, sans carte bancaire.
              </p>
              <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink href="/register" className="w-full px-7 py-3.5 text-base sm:w-auto">
                  Créer mon espace gratuitement
                </ButtonLink>
                <ButtonLink href="/outils" variant="ghost" className="w-full px-7 py-3.5 text-base sm:w-auto">
                  Essayer les outils gratuits, sans compte
                </ButtonLink>
              </div>
            </GlassCard>
          </Reveal>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
