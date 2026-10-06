// Catalogue des outils (02/10/2026) : une seule liste pour la page publique
// /outils et le menu « Outils » de l'application (/tools). Chaque outil a sa
// page publique (sans compte, démo pour l'IA) et sa version dans
// l'application, préremplie avec la marque active.
// 06/10/2026 : le Générateur de publications est retiré (il refaisait la
// page Publier) ; son ancienne adresse mène aux outils gratuits.
import { IconAvatar, IconChart, IconClock, IconHash, IconSearch, IconYouTube } from "@/components/dashboard/icons";

export type ToolSlug = "audit" | "bio-instagram" | "hashtags" | "titre-youtube" | "taux-engagement" | "meilleur-moment";

export interface ToolEntry {
  slug: ToolSlug;
  icon: (p: { className?: string }) => JSX.Element;
  title: string;
  /** Description de la page publique. */
  desc: string;
  /** Description dans l'application : ce que l'outil reprend de la marque. */
  appDesc: string;
  publicHref: string;
  appHref: string;
  /** Utilise l'IA (quota du palier). */
  ai: boolean;
}

export const TOOL_CATALOG: ToolEntry[] = [
  {
    slug: "audit",
    icon: IconSearch,
    title: "Audit de présence en ligne",
    desc: "Collez vos liens (YouTube, Instagram, TikTok, site) : un score sur 100, ce qui freine votre présence et quoi faire en premier.",
    appDesc: "Vos comptes connectés et votre Page bio sont déjà remplis : un score sur 100 et quoi faire en premier.",
    publicHref: "/outils/audit",
    appHref: "/tools/audit",
    ai: false
  },
  {
    slug: "bio-instagram",
    icon: IconAvatar,
    title: "Générateur de bio Instagram",
    desc: "Votre activité, un ton, un appel à l'action : cinq bios de 150 caractères maximum, prêtes à coller.",
    appDesc: "Cinq bios de 150 caractères maximum, à partir de l'accroche de votre media kit ou de votre Page bio.",
    publicHref: "/outils/bio-instagram",
    appHref: "/tools/bio-instagram",
    ai: true
  },
  {
    slug: "hashtags",
    icon: IconHash,
    title: "Générateur de hashtags",
    desc: "Trois groupes — larges, moyens, de niche — pour votre thématique et le réseau visé, à copier en un clic.",
    appDesc: "Trois groupes — larges, moyens, de niche — pour la thématique de votre marque et vos réseaux.",
    publicHref: "/outils/hashtags",
    appHref: "/tools/hashtags",
    ai: true
  },
  {
    slug: "titre-youtube",
    icon: IconYouTube,
    title: "Testeur de titre YouTube",
    desc: "Un score sur cinq critères en direct, puis trois reformulations plus accrocheuses proposées par l'IA.",
    appDesc: "Vos derniers titres YouTube notés sur cinq critères, puis trois reformulations par l'IA.",
    publicHref: "/outils/titre-youtube",
    appHref: "/tools/titre-youtube",
    ai: true
  },
  {
    slug: "taux-engagement",
    icon: IconChart,
    title: "Calculateur de taux d'engagement",
    desc: "Abonnés, j'aime, commentaires, partages : votre taux et son ordre de grandeur par réseau. Sans IA, sans compte.",
    appDesc: "Calculé avec les vrais chiffres de vos comptes connectés (30 derniers jours), comparé aux repères de chaque réseau.",
    publicHref: "/outils/taux-engagement",
    appHref: "/tools/taux-engagement",
    ai: false
  },
  {
    slug: "meilleur-moment",
    icon: IconClock,
    title: "Meilleur moment pour publier",
    desc: "Les créneaux qui fonctionnent le mieux en moyenne, par réseau et par jour, ajustés à votre fuseau horaire.",
    appDesc: "Votre créneau personnel quand vos relevés suffisent, et les créneaux moyens au fuseau de votre marque.",
    publicHref: "/outils/meilleur-moment",
    appHref: "/tools/meilleur-moment",
    ai: false
  }
];

/** Outils ouverts dans l'application sous /tools/<slug>. */
export const APP_TOOL_SLUGS = TOOL_CATALOG.filter((t) => t.appHref.startsWith("/tools/")).map((t) => t.slug);

export function toolBySlug(slug: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.slug === slug);
}
