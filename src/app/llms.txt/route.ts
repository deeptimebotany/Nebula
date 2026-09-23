import { PLAN_LIMITS } from "@/lib/plans";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { NETWORKS, NETWORK_META } from "@/lib/types";
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
  const networks = NETWORKS.map((n) => NETWORK_META[n].label).join(", ");

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} est un outil de planification et de publication pour les réseaux sociaux, en français et en euros, édité en France. Il s'adresse aux créateurs, indépendants, petites marques et agences qui gèrent plusieurs comptes : programmation multi-réseaux, calendrier, analytics unifiées, rapports clients automatiques, calendrier client partagé, page « link in bio », assistant IA et analyse de rétention vidéo.`,
    "",
    "## Réseaux",
    "",
    `- Pris en charge : ${networks} (publication via les API officielles).`,
    `- À venir (listes d'attente) : ${UPCOMING_NETWORKS.map((n) => n.label).join(", ")} — ${SITE_URL}/reseaux`,
    "",
    "## Tarifs",
    "",
    `- ${free.label} : ${euros(0)}, ${free.features[0]}, ${free.features[1].toLowerCase()}, ${free.features[2].toLowerCase()}, page bio (${free.maxBioLinks} liens). Sans carte bancaire, sans limite de durée.`,
    `- ${pro.label} : ${pro.tiers.map((t) => `${euros(t.priceMonthly)}/mois pour ${t.maxBrands} marques`).join(", ")} (annuel : ${pro.tiers.map((t) => euros(t.priceYearly)).join(", ")} par an, deux mois offerts). ${pro.maxConnections} comptes par marque, ${pro.maxPostsPerMonth} publications par mois et par marque, assistant IA, rapports clients, calendrier client, page bio (${pro.maxBioLinks} liens), utilisateurs illimités.`,
    `- ${agency.label} : ${agency.tiers.map((t) => `${euros(t.priceMonthly)}/mois pour ${t.maxBrands} marques`).join(", ")}. Comptes et publications illimités, publication en masse, support prioritaire.`,
    `- Tout nouveau compte reçoit ${TRIAL_DAYS} jours de ${pro.label} offerts. Le prix ne dépend que du nombre de marques ; rien n'est supprimé en cas de retour au palier ${free.label}.`,
    "",
    "## Pages utiles",
    "",
    `- [Tarifs](${SITE_URL}/tarifs) : grille complète, comparatif des paliers, calculateur d'économies.`,
    `- [Sécurité et données](${SITE_URL}/securite) : hébergement, chiffrement, API officielles, RGPD.`,
    `- [Outils gratuits](${SITE_URL}/outils) : générateurs de légendes, miniatures, bio Instagram, hashtags ; testeur de titre YouTube ; calculateur de taux d'engagement ; meilleur moment pour publier. Sans compte.`,
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
    `- Les pages publiques générées par ${SITE_NAME} (rapports clients, calendriers partagés, pages bio) portent la mention « Propulsé par ${SITE_NAME} ».`,
    ""
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}
