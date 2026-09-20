import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

// Page publique (aucune authentification requise) : les robots de
// validation des plateformes tierces (Meta, TikTok, Google...) doivent
// pouvoir l'atteindre pour approuver l'app pendant la configuration OAuth.
// ⚠️ Contenu générique à adapter : remplacez au minimum le nom légal /
// l'adresse de contact ci-dessous avant une mise en production réelle —
// ceci n'est pas un avis juridique.

const LAST_UPDATED = "20 septembre 2026";
const CONTACT_EMAIL = "nommelucas@gmail.com";

export const metadata = { title: "Conditions d'utilisation — Nebula" };

export default function TermsPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-aurora-300 hover:underline">
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-4 font-display text-3xl font-semibold text-white">Conditions d&apos;utilisation</h1>
        <p className="mt-2 text-sm text-slate-500">Dernière mise à jour : {LAST_UPDATED}</p>

        <GlassCard className="mt-8 space-y-6" hover={false}>
          <section>
            <h2 className="font-display text-lg font-medium text-white">1. Objet</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Les présentes conditions régissent l&apos;utilisation de Nebula (le « Service »), un outil de
              gestion, planification et publication de contenu sur des réseaux sociaux tiers (Instagram,
              Facebook, TikTok, YouTube). En créant un compte, vous acceptez ces conditions.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">2. Description du service</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nebula permet de connecter vos comptes de réseaux sociaux via les API officielles de chaque
              plateforme, de préparer, planifier et publier du contenu, et de consulter des statistiques de
              performance. Le Service ne republie ni ne modifie votre contenu sans action explicite de votre
              part.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">3. Compte utilisateur</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité effectuée
              depuis votre compte. Vous devez fournir une adresse email valide et nous informer de toute
              utilisation non autorisée de votre compte.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">4. Connexion à des plateformes tierces</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Lorsque vous connectez un compte Instagram, Facebook, TikTok ou YouTube, vous autorisez Nebula à
              accéder à ce compte dans les limites des permissions que vous accordez lors de l&apos;autorisation
              OAuth, uniquement pour exécuter les actions que vous demandez (publication, lecture de
              statistiques). Votre usage de ces réseaux reste soumis à leurs propres conditions d&apos;utilisation
              respectives. Vous pouvez révoquer cet accès à tout moment depuis la page « Comptes connectés » de
              Nebula ou directement depuis les paramètres du réseau concerné.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">5. Contenu publié</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous restez seul responsable du contenu (textes, images, vidéos) que vous importez et publiez via
              le Service, et devez disposer de tous les droits nécessaires sur ce contenu. Nebula ne
              revendique aucune propriété sur votre contenu et ne le republie que sur les comptes et selon la
              programmation que vous avez définis.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">6. Abonnements et paiement</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Certaines fonctionnalités sont proposées sous forme d&apos;abonnement payant, facturé via Stripe.
              Vous pouvez résilier votre abonnement à tout moment depuis la page Facturation ; la résiliation
              prend effet à la fin de la période déjà payée.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">7. Disponibilité du service</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Le Service est fourni « en l&apos;état », au mieux de nos efforts, sans garantie de disponibilité
              continue. Certaines fonctionnalités dépendent d&apos;API tierces (réseaux sociaux, IA, paiement)
              dont la disponibilité ou les conditions peuvent changer indépendamment de notre volonté.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">8. Résiliation</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous pouvez supprimer votre compte à tout moment depuis Paramètres → Compte &amp; confidentialité.
              Cette action est définitive et efface vos données conformément à notre politique de
              confidentialité.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">9. Modification des conditions</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Ces conditions peuvent être mises à jour ; la date en haut de cette page indique la dernière
              révision. Une utilisation continue du Service après modification vaut acceptation des nouvelles
              conditions.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">10. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Pour toute question relative à ces conditions : {CONTACT_EMAIL}
            </p>
          </section>
        </GlassCard>
      </div>
    </main>
  );
}
