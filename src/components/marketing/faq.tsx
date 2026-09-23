// Questions fréquentes de la page d'accueil — en <details>/<summary>
// natifs : accessibles au clavier et aux lecteurs d'écran sans JavaScript,
// indexables par les moteurs de recherche (le contenu est dans le HTML),
// et un seul style à maintenir. Les réponses reprennent le fonctionnement
// RÉEL du produit (quotas de plans.ts, OAuth, pages partagées par lien,
// export des données) — rien n'est promis qui n'existe pas.
import { PLAN_LIMITS } from "@/lib/plans";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Faut-il une carte bancaire pour commencer ?",
    a: `Non. Le palier Gratuit ne demande aucun moyen de paiement : ${PLAN_LIMITS.FREE.features[0].toLowerCase()}, ${PLAN_LIMITS.FREE.features[1].toLowerCase()} et ${PLAN_LIMITS.FREE.features[2].toLowerCase()}. Vous passez à un palier payant uniquement si vous en avez besoin.`
  },
  {
    q: "Comment mes comptes sont-ils connectés ?",
    a: "Par la connexion officielle de chaque plateforme (Meta pour Instagram et Facebook, TikTok, Google pour YouTube). Vous autorisez Nebula depuis la page du réseau lui-même : votre mot de passe Instagram, TikTok ou Google n'est jamais saisi dans Nebula. Vous pouvez révoquer l'accès à tout moment, depuis Nebula ou depuis le réseau."
  },
  {
    q: "Mes clients doivent-ils créer un compte pour voir leurs rapports ?",
    a: "Non. Les rapports clients et le calendrier client sont des pages accessibles par un lien privé que vous leur envoyez. Ils voient leurs résultats et les publications à venir, sans compte et sans accès à votre espace."
  },
  {
    q: "Puis-je gérer plusieurs marques ou plusieurs comptes par réseau ?",
    a: "Oui. Chaque marque a ses propres comptes connectés, son calendrier et ses statistiques. Le palier Pro permet 3, 5 ou 10 marques, le palier Agence 15, 25 ou 50 — le prix dépend du nombre choisi. Une marque peut avoir plusieurs comptes sur un même réseau (par exemple deux comptes Instagram)."
  },
  {
    q: "Que se passe-t-il si je dépasse mon quota de publications ?",
    a: "Nebula vous prévient avant : une barre de quota est visible dans le calendrier. Une fois la limite mensuelle atteinte, la programmation de nouvelles publications est bloquée jusqu'au mois suivant, ou immédiatement débloquée en passant au palier supérieur. Rien n'est supprimé."
  },
  {
    q: "L'assistant IA est-il obligatoire ?",
    a: "Non. L'IA (titres, légendes, chat, analyse de rétention, miniatures) est une aide optionnelle des paliers Pro et Agence. Sans elle, toutes les fonctions de planification, de publication et d'analyse fonctionnent normalement."
  },
  {
    q: "Puis-je résilier ou récupérer mes données ?",
    a: "Oui. L'abonnement se gère et se résilie depuis votre espace, à tout moment. Vos données (publications, comptes, statistiques) peuvent être exportées depuis les Paramètres, et votre compte supprimé en un clic."
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
