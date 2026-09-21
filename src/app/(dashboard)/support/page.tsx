"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { IconHeart } from "@/components/dashboard/icons";

// Variable publique (inlinée au build par Next.js) : tant qu'elle est vide,
// aucun lien de paiement n'est affiché — pas de fausse promesse, pas de bouton
// qui ne mène nulle part. Remplissez-la avec votre vrai lien Ko-fi, Buy Me a
// Coffee, PayPal.me ou un lien de paiement Stripe une fois que vous en avez un.
const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL;

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-magenta to-nebula-500 text-white shadow-glow-lg">
          <IconHeart className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-white">Soutenir Nebula</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          Nebula est développé et hébergé par une seule personne. Si le site vous est utile, un petit coup de pouce
          aide à financer l&apos;hébergement, les API et le temps passé à l&apos;améliorer. Un immense merci à celles
          et ceux qui soutiennent déjà le projet — chaque contribution compte.
        </p>
      </div>

      <GlassCard className="text-center">
        {DONATE_URL ? (
          <>
            <p className="text-sm text-slate-300">Chaque contribution, petite ou grande, fait une vraie différence.</p>
            <a href={DONATE_URL} target="_blank" rel="noreferrer" className="mt-4 inline-block">
              <Button className="px-6 py-3 text-base">
                <IconHeart className="h-4 w-4" /> Faire un don
              </Button>
            </a>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Le lien de soutien n&apos;est pas encore configuré sur cette instance (
            <code className="text-aurora-300">NEXT_PUBLIC_DONATE_URL</code> absent de <code className="text-aurora-300">.env</code>) —
            voir le README pour brancher votre lien Ko-fi, Buy Me a Coffee, PayPal.me ou Stripe.
          </p>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="mb-2 font-display text-sm font-medium text-white">D&apos;autres façons d&apos;aider</h2>
        <ul className="space-y-1.5 text-sm text-slate-400">
          <li>• Parlez de Nebula autour de vous, ou dans la Communauté (voir l&apos;onglet Communauté).</li>
          <li>• Signalez un bug ou une idée d&apos;amélioration.</li>
          <li>• Partagez vos retours d&apos;utilisation — c&apos;est ce qui fait le plus avancer le site.</li>
        </ul>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-sm font-medium text-white">Bientôt disponible</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Certaines fonctionnalités demandent des API payantes côté fournisseur. Elles ne sont pas incluses
          aujourd&apos;hui pour ne pas répercuter leur coût sur vous sans que le site ne génère de revenu — elles
          arriveront dès que les abonnements Nebula permettront de les financer sereinement :
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          <li className="rounded-lg bg-white/[0.02] p-3">
            <p className="font-medium text-slate-200">Connexion X (Twitter)</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Publier et lire les statistiques via l&apos;API X nécessite un plan développeur payant depuis la fin de
              son tier gratuit d&apos;écriture.
            </p>
          </li>
          <li className="rounded-lg bg-white/[0.02] p-3">
            <p className="font-medium text-slate-200">Palier IA avancé (Claude + Gemini)</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Nebula utilise aujourd&apos;hui Google Gemini, qui propose un vrai palier gratuit. Un palier payant plus
              rapide et plus puissant combinera Claude (Anthropic) et Gemini, avec des agents IA dédiés pour peaufiner
              automatiquement titres, légendes et miniatures — une qualité de rendu au-dessus de l&apos;assistant
              gratuit actuel, dès que les abonnements permettent d&apos;en financer le coût.
            </p>
          </li>
          <li className="rounded-lg bg-white/[0.02] p-3">
            <p className="font-medium text-slate-200">Hashtag Tracker</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Suivre la tendance d&apos;un hashtag en temps réel (façon Metricool) suppose d&apos;interroger l&apos;API
              de recherche X, elle-même payante — voir juste au-dessus. Reviendra en même temps que la connexion X.
            </p>
          </li>
        </ul>
      </GlassCard>
    </div>
  );
}
