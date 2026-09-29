import Link from "next/link";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Hero } from "@/components/marketing/hero";
import { PricingSection } from "@/components/marketing/pricing-section";
import { Faq } from "@/components/marketing/faq";
import { ProductShot, type ScreenName } from "@/components/marketing/product-shot";
import { ProductTour, type TourPanel } from "@/components/marketing/product-tour";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import {
  IconBioLink,
  IconCheck,
  IconDownload,
  IconHeart,
  IconLayers,
  IconLock,
  IconMediaKit,
  IconMessage,
  IconPlug,
  IconRetention,
  IconShield,
  IconTrophy,
  IconUsers
} from "@/components/dashboard/icons";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationLd, pageMetadata, softwareApplicationLd, websiteLd } from "@/lib/seo";
import { SEO_HOME } from "@/lib/seo-pages";

// L'accueil garde le titre par défaut du site (voir layout.tsx) et déclare
// son adresse canonique : c'est LA page à référencer.
export const metadata = pageMetadata({ ...SEO_HOME, absoluteTitle: true });

// Refonte du 29/09/2026 (demande de Lucas : « un accueil propre qui
// ressemble à mon site, professionnel »). Toutes les images sont de VRAIES
// captures de l'application (compte de démonstration aux données fictives,
// scripts/demo/), et tout ce qui est décrit existe dans l'application
// (quotas : src/lib/plans.ts). Aucun témoignage ni chiffre d'usage : il n'y
// en a pas encore de réels, on n'en invente pas.

interface TourScreen {
  id: string;
  label: string;
  shot: ScreenName;
  alt: string;
  title: string;
  desc: string;
  points: string[];
  plan?: string;
}

const TOUR: TourScreen[] = [
  {
    id: "publier",
    label: "Publier",
    shot: "publier",
    alt: "Écran Publier de Nebula : un visuel, un titre et une description, trois réseaux cochés et l'aperçu Instagram de la publication",
    title: "Une publication, tous vos réseaux",
    desc: "Ajoutez votre vidéo ou votre image, écrivez une fois et cochez les comptes. Nebula respecte les formats et les limites de chaque réseau, et publie à l'heure prévue.",
    points: ["Texte commun ou adapté réseau par réseau", "Aperçu de la publication sur chaque réseau avant l'envoi", "Titres, légendes et miniatures avec l'IA"],
    plan: "IA à partir du palier Pro"
  },
  {
    id: "calendrier",
    label: "Calendrier",
    shot: "calendrier",
    alt: "Calendrier éditorial de Nebula : un mois de publications programmées et publiées, avec les réseaux de chacune",
    title: "Tout votre planning d'un coup d'œil",
    desc: "En mois, en liste ou en agenda : vous voyez ce qui part, quand et sur quel réseau. Déplacez une publication d'un glisser-déposer, dupliquez-la pour la relancer.",
    points: ["Filtres par réseau et par marque", "Brouillons et publications programmées au même endroit", "Lien d'approbation à envoyer à un client"]
  },
  {
    id: "analytics",
    label: "Analytics",
    shot: "analytics",
    alt: "Page Analytics de Nebula : abonnés par réseau et courbe d'évolution des abonnés sur 30 jours",
    title: "Toutes vos statistiques, réunies",
    desc: "Abonnés, portée et engagement de chaque compte, au même endroit et mis à jour automatiquement, sans ouvrir quatre applications.",
    points: ["Évolution des abonnés, réseau par réseau", "Export CSV et rapport PDF", "Suivi de vos concurrents"]
  },
  {
    id: "studio",
    label: "Studio IA",
    shot: "studio",
    alt: "Studio IA de Nebula : classement des publications qui ont le mieux marché, meilleures heures et rythme de publication",
    title: "Des idées tirées de vos propres résultats",
    desc: "Le Studio repère vos publications qui ont le mieux marché, vos meilleures heures et votre rythme. L'IA s'en sert pour proposer des idées, des accroches et des scripts de vidéo.",
    points: ["Vos meilleures publications, calculées sur vos vrais chiffres", "Idées et accroches adaptées à chaque réseau", "Scripts de vidéo courte ou longue"],
    plan: "Paliers Pro et Agence"
  },
  {
    id: "page-bio",
    label: "Page bio",
    shot: "page-bio",
    alt: "Éditeur de page bio de Nebula : profil, liens et aperçu de la page sur téléphone",
    title: "Votre page « link in bio », incluse",
    desc: "Une page publique à mettre dans vos bios Instagram, TikTok ou YouTube, avec vos liens, vos couleurs et le nombre de clics de chaque lien.",
    points: ["Thèmes et cadres à choisir", "Clics comptés lien par lien", "Gratuit jusqu'à 3 liens"]
  },
  {
    id: "rapports",
    label: "Rapports clients",
    shot: "rapports",
    alt: "Rapport client de Nebula : abonnés, évolution, engagement moyen, impressions et publications de la période",
    title: "Des rapports que vos clients lisent",
    desc: "Pour chaque marque, un rapport à jour à chaque ouverture, partagé par un simple lien et envoyé automatiquement chaque semaine ou chaque mois.",
    points: ["Aucun compte à créer pour vos clients", "Envoi automatique par e-mail", "Calendrier partagé en lecture seule"],
    plan: "À partir du palier Pro"
  }
];

const AUDIENCES = [
  {
    title: "Créateurs de contenu",
    desc: "Vous publiez sur plusieurs réseaux et voulez y passer moins de temps.",
    points: [
      "Préparez une semaine de contenus en une fois",
      "Trouvez vos prochaines idées dans vos propres chiffres",
      "Page bio et media kit pour démarcher les marques"
    ],
    links: [
      { href: "/decouvrir/page-bio", label: "La page bio" },
      { href: "/decouvrir/media-kit", label: "Le media kit" }
    ]
  },
  {
    title: "Agences et community managers",
    desc: "Vous gérez plusieurs marques et devez rendre des comptes à vos clients.",
    points: [
      "Une marque par client, chacune avec ses comptes et son calendrier",
      "Rapports envoyés automatiquement, calendrier partagé",
      "Validation des publications par le client avant l'envoi"
    ],
    links: [{ href: "/decouvrir/rapports-clients", label: "Les rapports clients" }]
  }
];

const MORE = [
  { icon: IconMessage, title: "Commentaires", desc: "Les commentaires de vos réseaux dans une seule boîte, à lire et à traiter." },
  { icon: IconHeart, title: "Engagements", desc: "Likes, partages, enregistrements : ce que chaque publication déclenche." },
  { icon: IconRetention, title: "Rétention vidéo", desc: "Pour YouTube : où votre public décroche, et quoi changer la prochaine fois." },
  { icon: IconMediaKit, title: "Media kit", desc: "Une page pour les marques, avec vos vrais chiffres relevés automatiquement." },
  { icon: IconLayers, title: "Multi-marques", desc: "Passez d'une marque à l'autre sans vous déconnecter." },
  { icon: IconPlug, title: "API et webhooks", desc: "Branchez Nebula à n8n, Make ou Zapier (palier Agence)." },
  { icon: IconTrophy, title: "Réussites", desc: "Des missions et des rangs pour garder un rythme de publication régulier." },
  { icon: IconBioLink, title: "Liens de campagne", desc: "Des liens UTM prêts à coller, pour voir dans vos statistiques ce qui ramène du monde." }
];

const STEPS = [
  { title: "Connectez vos comptes", desc: "Instagram, TikTok, YouTube, Facebook, Bluesky : la connexion officielle de chaque réseau, en quelques clics." },
  { title: "Programmez vos publications", desc: "Un média, un texte, les comptes et la date. Nebula publie à l'heure prévue et vous prévient en cas de souci." },
  { title: "Suivez et partagez", desc: "Statistiques réunies, meilleures heures, rapports clients envoyés automatiquement." }
];

const TRUST = [
  { icon: IconLock, title: "Connexion officielle", desc: "Vos comptes sont reliés par l'autorisation officielle de chaque réseau. Votre mot de passe n'est jamais saisi dans Nebula." },
  { icon: IconShield, title: "Accès révocable", desc: "Déconnectez un compte à tout moment, depuis Nebula ou depuis le réseau lui-même." },
  { icon: IconDownload, title: "Vos données vous appartiennent", desc: "Exportez vos publications et statistiques, et supprimez votre compte en un clic." },
  { icon: IconUsers, title: "Vos clients voient l'essentiel", desc: "Rapports et calendriers partagés par lien privé, en lecture seule, sans accès à votre espace." }
];

function SectionHeading({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
      {desc && <p className="mt-4 text-base leading-relaxed text-slate-400">{desc}</p>}
    </div>
  );
}

// Texte au-dessus, capture en grand dessous : l'écran reste lisible.
function TourContent({ screen }: { screen: TourScreen }) {
  return (
    <div>
      <div className="mb-10 grid gap-6 lg:grid-cols-2 lg:gap-12">
        <div>
          <h3 className="font-display text-2xl font-semibold text-white sm:text-3xl">{screen.title}</h3>
          <p className="mt-3 text-base leading-relaxed text-slate-400">{screen.desc}</p>
        </div>
        <div className="lg:pt-1">
          <ul className="space-y-3 text-sm text-slate-300 sm:text-base">
            {screen.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-aurora-300 sm:mt-1" />
                {p}
              </li>
            ))}
          </ul>
          {screen.plan && <p className="mt-4 text-xs text-slate-500">{screen.plan}</p>}
        </div>
      </div>
      <ProductShot name={screen.shot} alt={screen.alt} sizes="(min-width: 1200px) 1104px, calc(100vw - 48px)" />
    </div>
  );
}

// Page pré-générée (lot 11), servie depuis le cache de Vercel. Un visiteur
// déjà connecté est envoyé au tableau de bord par le middleware, avant
// même que la page ne soit servie (voir src/middleware.ts).
export default function LandingPage() {
  const panels: TourPanel[] = TOUR.map((screen) => ({ id: screen.id, label: screen.label, content: <TourContent screen={screen} /> }));

  return (
    <>
      <MarketingNav />
      <main id="contenu" className="relative overflow-hidden">
        {/* Données structurées de l'accueil (SEO, 29/09/2026) : l'éditeur, le
            site et l'application avec ses prix réels. */}
        <JsonLd nodes={[organizationLd(), websiteLd(), softwareApplicationLd()]} />
        <div aria-hidden="true" className="hero-stars pointer-events-none absolute inset-0 opacity-20" />
        <Hero />

        {/* Visite de l'application : vraies captures, écran par écran */}
        <section id="visite" className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <SectionHeading
              eyebrow="L'application"
              title="Ce que vous trouverez dans Nebula"
              desc="Des captures de l'application telle qu'elle est, sur un compte de démonstration aux données fictives."
            />
          </Reveal>
          <ProductTour panels={panels} />
        </section>

        {/* Pour qui */}
        <section id="fonctionnalites" className="relative z-10 border-y border-white/[0.06] bg-white/[0.015] py-24">
          <div className="mx-auto max-w-6xl px-6">
            <Reveal>
              <SectionHeading eyebrow="Pour qui" title="Pensé pour ceux qui publient chaque semaine" />
            </Reveal>
            <RevealGroup className="grid gap-5 md:grid-cols-2">
              {AUDIENCES.map((a) => (
                <RevealItem key={a.title}>
                  <GlassCard hover={false} className="h-full p-7">
                    <h3 className="font-display text-xl font-semibold text-white">{a.title}</h3>
                    <p className="mt-2 text-sm text-slate-400">{a.desc}</p>
                    <ul className="mt-5 space-y-3 text-sm text-slate-300">
                      {a.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5">
                          <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-aurora-300" />
                          {p}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {a.links.map((l) => (
                        <Link key={l.href} href={l.href} className="font-medium text-aurora-300 hover:underline">
                          {l.label} →
                        </Link>
                      ))}
                    </p>
                  </GlassCard>
                </RevealItem>
              ))}
            </RevealGroup>

            <Reveal className="mt-20">
              <h3 className="text-center font-display text-xl font-semibold text-white">Et tout le reste, déjà inclus</h3>
            </Reveal>
            <RevealGroup className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {MORE.map((f) => (
                <RevealItem key={f.title}>
                  <div className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-aurora-300">
                      <f.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{f.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.desc}</p>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Comment ça marche */}
        <section id="comment-ca-marche" className="relative z-10 mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <SectionHeading eyebrow="Démarrer" title="Prêt en trois étapes" desc="Créez votre espace, connectez vos comptes, programmez votre première publication." />
          </Reveal>
          <RevealGroup className="grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <RevealItem key={step.title}>
                <div className="relative border-t border-white/10 pt-6">
                  <span className="font-display text-sm font-semibold text-aurora-300">Étape {i + 1}</span>
                  <h3 className="mt-2 font-display text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.desc}</p>
                </div>
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
                desc="Nebula passe uniquement par les autorisations officielles des réseaux et ne garde que ce qui sert à publier et à mesurer."
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
            <p className="mt-8 text-center text-sm">
              <Link href="/securite" className="font-medium text-aurora-300 hover:underline">
                Sécurité et protection des données →
              </Link>
            </p>
          </div>
        </section>

        <PricingSection />

        <Faq />

        {/* Appel final */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
          <Reveal>
            <GlassCard hover={false} className="relative overflow-hidden p-0">
              <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="p-8 sm:p-12">
                  <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">Essayez Nebula sur vos propres comptes</h2>
                  <p className="mt-4 text-base text-slate-400">
                    Créez votre espace en une minute, connectez un premier compte et programmez votre première publication. Gratuit,
                    sans carte bancaire.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <ButtonLink href="/register" className="w-full whitespace-nowrap px-6 py-3.5 text-base sm:w-auto">
                      Créer mon espace gratuit
                    </ButtonLink>
                    <ButtonLink href="/outils" variant="ghost" className="w-full whitespace-nowrap px-6 py-3.5 text-base sm:w-auto">
                      Essayer les outils gratuits
                    </ButtonLink>
                  </div>
                </div>
                <div className="hidden translate-x-8 translate-y-8 lg:block">
                  <ProductShot
                    name="calendrier"
                    alt="Calendrier éditorial de Nebula (compte de démonstration)"
                    sizes="560px"
                    className="rounded-br-none"
                  />
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
