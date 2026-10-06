// Questions fréquentes de la page d'accueil — en <details>/<summary>
// natifs : accessibles au clavier et aux lecteurs d'écran sans JavaScript,
// indexables par les moteurs de recherche (le contenu est dans le HTML),
// et un seul style à maintenir. Les réponses reprennent le fonctionnement
// RÉEL du produit (quotas de plans.ts, OAuth, pages partagées par lien,
// export des données) — rien n'est promis qui n'existe pas.
import { AI_MONTHLY, PLAN_LIMITS, brandChoicesLabel } from "@/lib/plans";
import { FOUNDERS_SALE_END_LABEL, FOUNDER_MONTHLY, FOUNDER_PREMIUM, euros, founderRegularPrice, foundersSaleOpen } from "@/lib/founders-offer";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Faut-il une carte bancaire pour commencer ?",
    a: `Non. Le palier Gratuit ne demande aucun moyen de paiement : ${PLAN_LIMITS.FREE.features[0].toLowerCase()}, ${PLAN_LIMITS.FREE.features[1].toLowerCase()} et ${PLAN_LIMITS.FREE.features[2].toLowerCase()}. Vous passez à un palier payant uniquement si vous en avez besoin.`
  },
  {
    q: "Comment mes comptes sont-ils connectés ?",
    a: "Par la connexion officielle de chaque plateforme (Meta pour Instagram et Facebook, TikTok, Google pour YouTube, Pinterest). Vous autorisez Nebula depuis la page du réseau lui-même : votre mot de passe n'est jamais saisi dans Nebula. Bluesky, lui, se relie par un mot de passe d'application que vous pouvez supprimer à tout moment. Vous pouvez révoquer l'accès à tout moment, depuis Nebula ou depuis le réseau."
  },
  {
    q: "Mes clients doivent-ils créer un compte pour voir leurs rapports ?",
    a: "Non. Les rapports clients et le calendrier client sont des pages accessibles par un lien privé que vous leur envoyez. Ils voient leurs résultats et les publications à venir, sans compte et sans accès à votre espace."
  },
  {
    q: "Puis-je gérer plusieurs marques ou plusieurs comptes par réseau ?",
    a: `Oui. Chaque marque a ses propres comptes connectés, son calendrier et ses statistiques. Le palier Pro permet ${brandChoicesLabel("PRO")} marques (dès ${PLAN_LIMITS.PRO.tiers[0].priceMonthly} € par mois), le palier Agence ${brandChoicesLabel("AGENCY")} (dès ${PLAN_LIMITS.AGENCY.tiers[0].priceMonthly} €) : le prix dépend du nombre choisi. Une marque peut avoir plusieurs comptes sur un même réseau (par exemple deux comptes Instagram).`
  },
  {
    q: "Que se passe-t-il si je dépasse mon quota de publications ?",
    a: "Nebula vous prévient avant : une barre de quota est visible dans le calendrier. Une fois la limite mensuelle atteinte, la programmation de nouvelles publications est bloquée jusqu'au mois suivant, ou immédiatement débloquée en passant au palier supérieur. Rien n'est supprimé."
  },
  {
    q: "L'assistant IA est-il obligatoire ?",
    a: `Non. L'IA (titres, légendes, chat, analyse de rétention, miniatures) est une aide optionnelle des paliers Pro et Agence, avec des quotas par mois (en Pro : ${AI_MONTHLY.PRO.retention} analyses Rétention, ${AI_MONTHLY.PRO.image} miniatures). Sans elle, toutes les fonctions de planification, de publication et d'analyse fonctionnent normalement.`
  },
  {
    q: "Y a-t-il une offre de lancement ?",
    // Page générée au build : après le 1er janvier 2027, le prochain déploiement passe au passé.
    a: foundersSaleOpen()
      ? `Oui, en places limitées et jusqu'au ${FOUNDERS_SALE_END_LABEL}. « Fondateur » : ${PLAN_LIMITS.PRO.label} 1 marque à ${FOUNDER_MONTHLY.priceMonthly} € par mois pendant ${FOUNDER_MONTHLY.months} mois, puis ${founderRegularPrice()} €, pour les ${FOUNDER_MONTHLY.places} premiers abonnés. « Fondateur Premium » : ${euros(FOUNDER_PREMIUM.priceCents)} en une fois pour ${PLAN_LIMITS.PRO.label} 1 marque pendant ${FOUNDER_PREMIUM.months} mois, sans renouvellement (${FOUNDER_PREMIUM.places} places). Les deux donnent le badge « Fondateur » à vie.`
      : `Les offres de lancement « Fondateur » et « Fondateur Premium » ont pris fin le ${FOUNDERS_SALE_END_LABEL}. Les fondateurs gardent leurs avantages jusqu'à leur terme et leur badge « Fondateur » à vie.`
  },
  {
    q: "Puis-je résilier ou récupérer mes données ?",
    a: "Oui. L'abonnement se renouvelle automatiquement et se gère ou se résilie depuis votre espace, à tout moment. Vos données (publications, comptes, statistiques) peuvent être exportées depuis les Paramètres, et votre compte supprimé en un clic."
  }
];

export function Faq() {
  return (
    <section id="faq" className="relative z-10 mx-auto max-w-3xl scroll-mt-24 px-6 py-24">
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">FAQ</p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">Questions fréquentes</h2>
      </div>
      <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.02]">
        {FAQ.map((item) => (
          <details key={item.q} className="group px-5 py-4 open:bg-white/[0.02]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-medium text-white marker:content-none [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition group-open:rotate-45 group-open:text-white"
              >
                +
              </span>
            </summary>
            <p className="mt-3 pr-10 text-sm leading-relaxed text-slate-400">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
