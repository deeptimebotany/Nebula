import { AI_MONTHLY, PLAN_LIMITS, RETENTION_PACK, brandsText, formatEuroCents } from "@/lib/plans";
import { FOUNDER_MONTHLY, FOUNDER_PREMIUM, euros as eurosCents, founderRegularPrice } from "@/lib/founders-offer";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { LAUNCHED_NETWORKS, NETWORK_META } from "@/lib/types";
import { configuredMediaSources } from "@/lib/integrations/config";
import { MEDIA_SOURCE_LABELS } from "@/lib/media-sources";
import { COMPETITORS, UPCOMING_NETWORKS } from "@/data/competitors";
import { TRIAL_DAYS } from "@/lib/trial";

// /llms.txt (brief growth, lot G5.e) : texte factuel destiné aux moteurs de
// réponse (ChatGPT, Claude, Perplexity…), généré depuis plans.ts, site.ts
// et competitors.ts — jamais de chiffre en dur. Convention llms.txt :
// Markdown court, titre H1, résumé en citation, puis listes de liens.
export const dynamic = "force-static";

function euros(n: number): string {
  return `${n.toLocaleString("fr-FR")} €`;
}

export function GET() {
  const pro = PLAN_LIMITS.PRO;
  const agency = PLAN_LIMITS.AGENCY;
  const free = PLAN_LIMITS.FREE;
  const networks = LAUNCHED_NETWORKS.map((n) => NETWORK_META[n].label).join(", ");

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} est un outil de planification et de publication pour les réseaux sociaux, en français et en euros, édité en France. Il s'adresse aux créateurs, indépendants, petites marques et agences qui gèrent plusieurs comptes : programmation multi-réseaux, calendrier, analytics unifiées, rapports clients automatiques, calendrier client partagé, page « link in bio », media kit pour les sponsors, assistant IA, Studio IA et analyse de rétention vidéo.`,
    "",
    "## Réseaux",
    "",
    `- Pris en charge : ${networks} (publication via les API officielles).`,
    `- À venir (listes d'attente) : ${UPCOMING_NETWORKS.map((n) => n.label).join(", ")} — ${SITE_URL}/reseaux`,
    `- Import des photos et vidéos dans Publier : depuis l'ordinateur ou le téléphone${configuredMediaSources().map((id) => `, ${MEDIA_SOURCE_LABELS[id]}`).join("")}.`,
    "",
    "## Tarifs",
    "",
    `- ${free.label} : ${euros(0)}, ${free.features[0]}, ${free.features[1].toLowerCase()}, ${free.features[2].toLowerCase()}, page bio (${free.maxBioLinks} liens). Sans carte bancaire, sans limite de durée.`,
    `- ${pro.label} : ${pro.tiers.map((t) => `${euros(t.priceMonthly)}/mois pour ${brandsText(t.maxBrands)}`).join(", ")} (annuel : ${pro.tiers.map((t) => euros(t.priceYearly)).join(", ")} par an, deux mois offerts). ${pro.maxConnections} comptes par marque, ${pro.maxPostsPerMonth} publications par mois et par marque, IA avec quotas du mois (${pro.aiMonthly.retention} analyses Rétention, ${pro.aiMonthly.image} miniatures, ${pro.aiMonthly.studio} générations du Studio, ${pro.aiMonthly.assistant} messages à l'assistant), rapports clients, calendrier client, page bio (${pro.maxBioLinks} liens). Un utilisateur par compte.`,
    `- ${agency.label} : ${agency.tiers.map((t) => `${euros(t.priceMonthly)}/mois pour ${brandsText(t.maxBrands)}`).join(", ")} (annuel : ${agency.tiers.map((t) => euros(t.priceYearly)).join(", ")} par an). Comptes et publications illimités, publication en masse, IA avec quotas du mois (${agency.aiMonthly.retention} analyses Rétention, ${agency.aiMonthly.image} miniatures, ${agency.aiMonthly.studio} générations du Studio, ${agency.aiMonthly.assistant} messages), support prioritaire.`,
    `- Offres de lancement : « Fondateur », ${pro.label} 1 marque à ${euros(FOUNDER_MONTHLY.priceMonthly)}/mois pendant ${FOUNDER_MONTHLY.months} mois puis ${euros(founderRegularPrice())}, pour les ${FOUNDER_MONTHLY.places} premiers abonnés ; « Fondateur Premium », ${eurosCents(FOUNDER_PREMIUM.priceCents)} en une fois pour ${pro.label} 1 marque pendant ${FOUNDER_PREMIUM.months} mois, sans renouvellement, ${FOUNDER_PREMIUM.places} places.`,
    `- Recharge Rétention (${pro.label} et ${agency.label}) : +${RETENTION_PACK.credits} analyses pour ${formatEuroCents(RETENTION_PACK.priceCents)}, paiement unique, sans date limite.`,
    `- Tout nouveau compte reçoit ${TRIAL_DAYS} jours d'essai (IA sur tout l'essai : ${AI_MONTHLY.TRIAL.retention} analyses Rétention, ${AI_MONTHLY.TRIAL.image} miniatures, ${AI_MONTHLY.TRIAL.studio} générations du Studio, ${AI_MONTHLY.TRIAL.assistant} messages). Le prix ne dépend que du nombre de marques ; rien n'est supprimé en cas de retour au palier ${free.label}.`,
    "",
    "## Pages utiles",
    "",
    `- [Tarifs](${SITE_URL}/tarifs) : grille complète, comparatif des paliers, calculateur d'économies.`,
    `- [Sécurité et données](${SITE_URL}/securite) : hébergement, chiffrement, API officielles, RGPD.`,
    `- [Audit de présence en ligne gratuit](${SITE_URL}/outils/audit) : score sur 100 d'une chaîne YouTube, d'un compte Instagram professionnel, d'un profil TikTok et d'un site (régularité, engagement, profil, contenu, cohérence), avec des conseils concrets. Données publiques, sans compte.`,
    `- [Media kit](${SITE_URL}/decouvrir/media-kit) : page à envoyer aux marques, avec les vrais chiffres des comptes relevés automatiquement, présentation, tarifs, PDF. Aperçu gratuit, publication avec ${pro.label}.`,
    `- [Outils gratuits](${SITE_URL}/outils) : générateur de publications (titre, légende et miniature réunis, comme la page Publier), générateurs de bio Instagram et de hashtags ; testeur de titre YouTube ; calculateur de taux d'engagement ; meilleur moment pour publier. Les générateurs IA demandent un compte gratuit (sans compte : démo préparée à l'avance, sans IA) ; les calculateurs et l'audit sont ouverts à tous. Une fois connecté, les mêmes outils sont dans le menu « Outils » de l'application, remplis avec les chiffres des comptes connectés.`,
    `- [Alternatives](${SITE_URL}/alternatives) : comparatifs avec ${COMPETITORS.map((c) => c.name).join(", ")} (prix constatés et datés).`,
    `- [Réseaux](${SITE_URL}/reseaux) : pris en charge et à venir.`,
    `- [Contact](${SITE_URL}/contact)`,
    "",
    "## Comparatifs",
    "",
    ...COMPETITORS.map((c) => `- [Alternative à ${c.name}](${SITE_URL}/alternatives/${c.slug}) · [Tarifs ${c.name} expliqués](${SITE_URL}/prix/${c.slug})`),
    "",
    "## Notes",
    "",
    "- Interface, support et documentation en français. Paiement par carte via Stripe, résiliable ou mettable en pause à tout moment.",
    `- Les pages publiques générées par ${SITE_NAME} (rapports clients, calendriers partagés, pages bio, media kits) portent la mention « Propulsé par ${SITE_NAME} ».`,
    ""
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}
