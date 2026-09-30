import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { IconSparkle, IconSend, IconChart, IconAvatar, IconHash, IconYouTube, IconClock, IconSearch } from "@/components/dashboard/icons";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl, breadcrumbLd, pageMetadata } from "@/lib/seo";
import { SEO_TOOLS, SEO_TOOLS_HUB } from "@/lib/seo-pages";

// Hub des outils IA gratuits (voir la feuille de route —
// produit n°2 : aimant à visiteurs qui redirige ensuite vers un compte
// Nebula payant). Page publique, volontairement HORS du groupe (dashboard)
// et absente de middleware.ts, pour rester accessible sans connexion.
// 29/09/2026 : les générateurs IA demandent un compte gratuit ; sans compte,
// démo préparée à l'avance (sans IA). Audit, taux d'engagement, meilleur
// moment et score de titre restent ouverts à tous.
export const metadata = pageMetadata(SEO_TOOLS_HUB);

// Données structurées : fil d'Ariane et liste des outils (SEO, 29/09/2026).
const HUB_LD = [
  breadcrumbLd([
    ["Accueil", "/"],
    ["Outils gratuits", "/outils"]
  ]),
  {
    "@type": "ItemList",
    name: "Outils gratuits Nebula",
    itemListElement: Object.values(SEO_TOOLS).map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.toolName ?? t.title, url: absoluteUrl(t.path) }))
  }
];

// Le générateur de publications (30/09/2026 : légendes, titres et miniatures
// réunis, comme la page Publier) prend toute la largeur, en tête.
const TOOLS: { href: string; icon: (p: { className?: string }) => JSX.Element; title: string; desc: string; featured?: boolean }[] = [
  {
    href: "/outils/publier",
    icon: IconSend,
    title: "Générateur de publications",
    desc: "Comme la page Publier de Nebula, en un seul outil : votre vidéo et sa miniature, le titre et la description écrits par l'IA pour le réseau visé, et l'aperçu fidèle de la publication.",
    featured: true
  },
  {
    href: "/outils/audit",
    icon: IconSearch,
    title: "Audit de présence en ligne",
    desc: "Collez vos liens (YouTube, Instagram, TikTok, site) : un score sur 100, ce qui freine votre présence et quoi faire en premier."
  },
  {
    href: "/outils/bio-instagram",
    icon: IconAvatar,
    title: "Générateur de bio Instagram",
    desc: "Votre activité, un ton, un appel à l'action : cinq bios de 150 caractères maximum, prêtes à coller."
  },
  {
    href: "/outils/hashtags",
    icon: IconHash,
    title: "Générateur de hashtags",
    desc: "Trois groupes — larges, moyens, de niche — pour votre thématique et le réseau visé, à copier en un clic."
  },
  {
    href: "/outils/titre-youtube",
    icon: IconYouTube,
    title: "Testeur de titre YouTube",
    desc: "Un score sur cinq critères en direct, puis trois reformulations plus accrocheuses proposées par l'IA."
  },
  {
    href: "/outils/taux-engagement",
    icon: IconChart,
    title: "Calculateur de taux d'engagement",
    desc: "Abonnés, j'aime, commentaires, partages : votre taux et son ordre de grandeur par réseau. Sans IA, sans compte."
  },
  {
    href: "/outils/meilleur-moment",
    icon: IconClock,
    title: "Meilleur moment pour publier",
    desc: "Les créneaux qui fonctionnent le mieux en moyenne, par réseau et par jour, ajustés à votre fuseau horaire."
  }
];

export default function OutilsHubPage() {
  return (
    <main id="contenu" className="relative overflow-hidden">
      <JsonLd nodes={HUB_LD} />
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="noise-grid grain-overlay pointer-events-none absolute inset-x-0 top-0 h-[600px]" />

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-10 pt-16 text-center sm:pt-20">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-aurora-400/30 bg-white/[0.03] px-4 py-1.5 text-xs text-aurora-200">
          <IconSparkle className="h-3.5 w-3.5" />
          Gratuit, sans carte bancaire
        </div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-white sm:text-5xl">
          Outils IA gratuits pour vos réseaux sociaux
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400 sm:text-base">
          Les mêmes assistants IA que dans Nebula. Voyez une démo tout de suite, puis générez les vôtres avec un
          compte gratuit (10 textes et 2 miniatures par jour). Audit, taux d&apos;engagement et meilleur moment : sans
          compte.
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-16">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} className={tool.featured ? "sm:col-span-2" : undefined}>
              <GlassCard className="h-full transition hover:border-aurora-400/30">
                <tool.icon className="h-6 w-6 text-aurora-300" />
                <h2 className="mt-3 font-display text-lg font-medium text-white">{tool.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{tool.desc}</p>
                <span className="mt-4 inline-block text-sm font-medium text-aurora-300">Essayer →</span>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-2xl px-6 pb-24 text-center">
        <GlassCard hover={false} className="p-8">
          <h2 className="font-display text-xl font-semibold text-white">Envie d&apos;aller plus loin ?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Créez un espace Nebula gratuit pour connecter vos réseaux, planifier vos publications et suivre vos
            statistiques. L&apos;assistant IA intégré (titres, légendes, miniatures depuis vos vidéos) fait partie des
            paliers Pro et Agence.
          </p>
          <ButtonLink href="/register" className="mt-5 px-6 py-3 text-base">
            Créer mon espace gratuitement
          </ButtonLink>
        </GlassCard>
      </section>
    </main>
  );
}
