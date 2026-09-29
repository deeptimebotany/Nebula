// Titres, descriptions et images de partage des pages publiques (SEO
// technique, 29/09/2026) : un seul endroit, relu par les pages (métadonnées),
// les images de partage (opengraph-image.tsx), les données structurées et le
// test tests/quality/seo.test.ts (longueurs, unicité, canoniques).
//
// Règles : titre de 60 caractères au plus (hors « — Nebula »), mot-clé
// visé en tête ; description de 155 caractères au plus, qui dit ce que la
// page apporte et, pour les outils IA, qu'il faut un compte gratuit pour
// générer (sans compte : démo, sans IA).
import { PLAN_LIMITS } from "@/lib/plans";
import { TRIAL_DAYS } from "@/lib/trial";

const PRO_FROM = PLAN_LIMITS.PRO.tiers[0];
const AGENCY_FROM = PLAN_LIMITS.AGENCY.tiers[0];

export interface SeoPage {
  path: string;
  title: string;
  description: string;
  /** Petit libellé au-dessus du titre, sur l'image de partage. */
  eyebrow: string;
  /** Titre court de l'image de partage (par défaut : le titre). */
  imageTitle?: string;
  imageSubtitle?: string;
  /** Nom de l'outil (données structurées WebApplication). */
  toolName?: string;
}

export const SEO_HOME: SeoPage = {
  path: "/",
  title: "Nebula — Planifier et publier sur vos réseaux sociaux",
  description:
    "Programmez vos publications Instagram, TikTok, YouTube, Facebook et Bluesky, suivez vos statistiques et vos clients au même endroit. Gratuit au départ.",
  eyebrow: "Réseaux sociaux"
};

export const SEO_PRICING: SeoPage = {
  path: "/tarifs",
  title: `Tarifs : gratuit, Pro dès ${PRO_FROM.priceMonthly} €/mois, Agence dès ${AGENCY_FROM.priceMonthly} €`,
  description: `Gratuit pour commencer, Pro dès ${PRO_FROM.priceMonthly} € par mois pour ${PRO_FROM.maxBrands} marques, Agence dès ${AGENCY_FROM.priceMonthly} € pour ${AGENCY_FROM.maxBrands} marques. ${TRIAL_DAYS} jours d'essai offerts, sans carte bancaire.`,
  eyebrow: "Tarifs",
  imageTitle: "Des tarifs simples, en euros",
  imageSubtitle: `Gratuit pour commencer · Pro dès ${PRO_FROM.priceMonthly} €/mois · Agence dès ${AGENCY_FROM.priceMonthly} €/mois`
};

export const SEO_TOOLS_HUB: SeoPage = {
  path: "/outils",
  title: "Outils IA gratuits pour les réseaux sociaux",
  description:
    "Légendes, hashtags, bio Instagram, miniatures, audit de présence, taux d'engagement et meilleur moment pour publier : des outils gratuits, en français.",
  eyebrow: "Outils gratuits",
  imageSubtitle: "Légendes, hashtags, bio Instagram, miniatures, audit, taux d'engagement"
};

/** Les outils de /outils, dans l'ordre du hub. */
export const SEO_TOOLS: Record<string, SeoPage> = {
  audit: {
    path: "/outils/audit",
    toolName: "Audit de présence en ligne",
    title: "Audit gratuit de vos réseaux sociaux : score sur 100",
    description:
      "Collez vos liens YouTube, Instagram, TikTok ou votre site : score de présence sur 100, régularité, engagement et conseils concrets. Gratuit, sans compte.",
    eyebrow: "Outil gratuit",
    imageTitle: "Audit de présence en ligne",
    imageSubtitle: "Un score sur 100 et quoi faire en premier"
  },
  legendes: {
    path: "/outils/legendes",
    toolName: "Générateur de légendes et de titres",
    title: "Générateur de légendes Instagram et TikTok (IA)",
    description:
      "Décrivez votre publication : l'IA écrit le titre et la légende pour Instagram, TikTok, YouTube ou Facebook, avec l'aperçu. Avec un compte gratuit.",
    eyebrow: "Outil IA",
    imageTitle: "Générateur de légendes",
    imageSubtitle: "Instagram · TikTok · YouTube · Facebook"
  },
  miniatures: {
    path: "/outils/miniatures",
    toolName: "Générateur de miniatures",
    title: "Générateur de miniatures YouTube par IA",
    description:
      "Déposez votre vidéo : les meilleures images en ressortent, en aperçu YouTube ou TikTok. L'IA les rend plus percutantes avec un compte gratuit.",
    eyebrow: "Outil IA",
    imageTitle: "Générateur de miniatures",
    imageSubtitle: "Les meilleures images de votre vidéo, en miniature"
  },
  "bio-instagram": {
    path: "/outils/bio-instagram",
    toolName: "Générateur de bio Instagram",
    title: "Générateur de bio Instagram (IA, en français)",
    description:
      "Cinq bios Instagram de 150 caractères maximum, adaptées à votre activité et à votre ton. Démo sans compte, génération par l'IA avec un compte gratuit.",
    eyebrow: "Outil IA",
    imageTitle: "Générateur de bio Instagram",
    imageSubtitle: "Cinq bios de 150 caractères, prêtes à coller"
  },
  hashtags: {
    path: "/outils/hashtags",
    toolName: "Générateur de hashtags",
    title: "Générateur de hashtags Instagram, TikTok et YouTube",
    description:
      "Hashtags larges, moyens et de niche pour votre thématique et votre réseau, à copier en un clic. Démo sans compte, génération IA avec un compte gratuit.",
    eyebrow: "Outil IA",
    imageTitle: "Générateur de hashtags",
    imageSubtitle: "Larges, moyens et de niche, par réseau"
  },
  "titre-youtube": {
    path: "/outils/titre-youtube",
    toolName: "Testeur de titre YouTube",
    title: "Testeur de titre YouTube : score et reformulations",
    description:
      "Notez votre titre YouTube sur 5 critères (longueur, chiffre, mot fort, question) et obtenez 3 reformulations plus accrocheuses. Score gratuit, sans compte.",
    eyebrow: "Outil gratuit",
    imageTitle: "Testeur de titre YouTube",
    imageSubtitle: "Un score sur 5 critères, puis 3 reformulations"
  },
  "taux-engagement": {
    path: "/outils/taux-engagement",
    toolName: "Calculateur de taux d'engagement",
    title: "Calculateur de taux d'engagement Instagram et TikTok",
    description:
      "Calculez votre taux d'engagement Instagram, TikTok, YouTube ou Facebook et comparez-le aux ordres de grandeur de chaque réseau. Gratuit, sans compte.",
    eyebrow: "Outil gratuit",
    imageTitle: "Calculateur de taux d'engagement",
    imageSubtitle: "Instagram · TikTok · YouTube · Facebook"
  },
  "meilleur-moment": {
    path: "/outils/meilleur-moment",
    toolName: "Meilleur moment pour publier",
    title: "Meilleur moment pour publier, réseau par réseau",
    description:
      "Les jours et heures qui fonctionnent le mieux en moyenne sur Instagram, TikTok, YouTube et Facebook, dans votre fuseau horaire. Gratuit, sans compte.",
    eyebrow: "Outil gratuit",
    imageTitle: "Meilleur moment pour publier",
    imageSubtitle: "Par réseau, par jour, dans votre fuseau"
  }
};

export const SEO_CONTACT: SeoPage = {
  path: "/contact",
  title: "Contact : écrire à l'équipe Nebula",
  description:
    "Une question sur Nebula, les tarifs ou votre compte ? Écrivez-nous : chaque message reçoit une réponse personnelle, en général sous un à deux jours ouvrés.",
  eyebrow: "Contact"
};

export const SEO_SECURITY: SeoPage = {
  path: "/securite",
  title: "Sécurité et protection des données",
  description:
    "Comment Nebula protège vos comptes et vos données : connexion officielle OAuth, jetons jamais exposés, chiffrement, export et suppression à tout moment.",
  eyebrow: "Sécurité"
};

export const SEO_LEGAL: SeoPage = {
  path: "/legal",
  title: "Mentions légales, CGU et confidentialité",
  description: "Mentions légales, conditions générales d'utilisation, politique de confidentialité et cookies du service Nebula, en français clair.",
  eyebrow: "Informations légales"
};

export const SEO_REGISTER: SeoPage = {
  path: "/register",
  title: "Créer un compte gratuit",
  description:
    "Créez votre espace Nebula gratuitement, sans carte bancaire : programmez vos publications et suivez vos statistiques sur tous vos réseaux au même endroit.",
  eyebrow: "Inscription"
};

export const SEO_LOGIN: SeoPage = {
  path: "/login",
  title: "Connexion",
  description: "Connectez-vous à votre espace Nebula pour planifier, publier et analyser vos réseaux sociaux.",
  eyebrow: "Connexion"
};

export const SEO_ALTERNATIVES: SeoPage = {
  path: "/alternatives",
  title: "Alternatives à Hootsuite, Buffer, Metricool… comparées",
  description: `Hootsuite, Buffer, Later, Metricool, Swello, Agorapulse… : prix constatés et fonctions comparées face à Nebula, dès ${PRO_FROM.priceMonthly} € par mois.`,
  eyebrow: "Comparatifs"
};

export const SEO_NETWORKS: SeoPage = {
  path: "/reseaux",
  title: "Réseaux pris en charge et à venir",
  description: "Nebula publie sur Instagram, TikTok, YouTube, Facebook et Bluesky. Threads, LinkedIn et Pinterest arrivent : inscrivez-vous pour être prévenu.",
  eyebrow: "Réseaux"
};

export const SEO_DISCOVER: Record<"media-kit" | "page-bio" | "rapports-clients", SeoPage> = {
  "media-kit": {
    path: "/decouvrir/media-kit",
    title: "Media kit en ligne avec vos vrais chiffres",
    description:
      "Un media kit toujours à jour pour démarcher les marques : abonnés, engagement et meilleures publications relevés automatiquement, PDF. Aperçu gratuit.",
    eyebrow: "Media kit",
    imageSubtitle: "Vos vrais chiffres, relevés automatiquement"
  },
  "page-bio": {
    path: "/decouvrir/page-bio",
    title: "Page bio gratuite (link in bio) pour Instagram et TikTok",
    description:
      "Une page « link in bio » prête en deux minutes, avec vos publications programmées et vos statistiques au même endroit. Gratuit jusqu'à 3 liens.",
    eyebrow: "Page bio",
    imageTitle: "Votre page bio, gratuite",
    imageSubtitle: "Tous vos liens, avec le suivi des clics"
  },
  "rapports-clients": {
    path: "/decouvrir/rapports-clients",
    title: "Rapports clients et calendrier partagé automatiques",
    description:
      "Rapports automatiques, calendrier partagé et approbation en un clic pour vos clients : Nebula les envoie pour vous, marque par marque.",
    eyebrow: "Agences",
    imageTitle: "Rapports clients automatiques",
    imageSubtitle: "Rapports, calendrier partagé, approbation en un clic"
  }
};
