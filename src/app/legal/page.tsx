import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

// Page publique combinée (aucune authentification requise) : certains
// formulaires de plateforme (ex. TikTok Developer Portal) ne proposent
// qu'UN SEUL champ d'URL "legal" au lieu de deux champs séparés Conditions /
// Confidentialité — cette page réunit donc les deux sur une seule adresse,
// avec des ancres (#conditions / #confidentialite) pour y renvoyer
// directement. /terms et /privacy restent disponibles séparément (voir
// next.config.js) pour les formulaires qui, eux, demandent bien deux URLs
// distinctes.
// ⚠️ Contenu générique à adapter : remplacez au minimum le nom légal si
// besoin avant une mise en production réelle — ceci n'est pas un avis
// juridique.

const LAST_UPDATED = "20 septembre 2026";
const CONTACT_EMAIL = "nommelucas@gmail.com";

export const metadata = { title: "Mentions légales — Nebula" };

export default function LegalPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-aurora-300 hover:underline">
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-4 font-display text-3xl font-semibold text-white">
          Conditions d&apos;utilisation &amp; confidentialité
        </h1>
        <p className="mt-2 text-sm text-slate-500">Dernière mise à jour : {LAST_UPDATED}</p>
        <p className="mt-3 flex gap-4 text-sm">
          <a href="#conditions" className="text-aurora-300 hover:underline">
            Aller aux conditions d&apos;utilisation
          </a>
          <a href="#confidentialite" className="text-aurora-300 hover:underline">
            Aller à la confidentialité
          </a>
        </p>

        <GlassCard id="conditions" className="mt-8 scroll-mt-6 space-y-6" hover={false}>
          <h2 className="font-display text-xl font-semibold text-white">Conditions d&apos;utilisation</h2>

          <section>
            <h3 className="font-display text-lg font-medium text-white">1. Objet</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Les présentes conditions régissent l&apos;utilisation de Nebula (le « Service »), un outil de
              gestion, planification et publication de contenu sur des réseaux sociaux tiers (Instagram,
              Facebook, TikTok, YouTube). En créant un compte, vous acceptez ces conditions.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">2. Description du service</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nebula permet de connecter vos comptes de réseaux sociaux via les API officielles de chaque
              plateforme, de préparer, planifier et publier du contenu, et de consulter des statistiques de
              performance. Le Service ne republie ni ne modifie votre contenu sans action explicite de votre
              part.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">3. Compte utilisateur</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité effectuée
              depuis votre compte. Vous devez fournir une adresse email valide et nous informer de toute
              utilisation non autorisée de votre compte.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">4. Connexion à des plateformes tierces</h3>
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
            <h3 className="font-display text-lg font-medium text-white">5. Contenu publié</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous restez seul responsable du contenu (textes, images, vidéos) que vous importez et publiez via
              le Service, et devez disposer de tous les droits nécessaires sur ce contenu. Nebula ne
              revendique aucune propriété sur votre contenu et ne le republie que sur les comptes et selon la
              programmation que vous avez définis.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">6. Abonnements et paiement</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Certaines fonctionnalités sont proposées sous forme d&apos;abonnement payant, facturé via Stripe.
              Vous pouvez résilier votre abonnement à tout moment depuis la page Facturation ; la résiliation
              prend effet à la fin de la période déjà payée.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">7. Disponibilité du service</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Le Service est fourni « en l&apos;état », au mieux de nos efforts, sans garantie de disponibilité
              continue. Certaines fonctionnalités dépendent d&apos;API tierces (réseaux sociaux, IA, paiement)
              dont la disponibilité ou les conditions peuvent changer indépendamment de notre volonté.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">8. Résiliation</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous pouvez supprimer votre compte à tout moment depuis Paramètres → Compte &amp; confidentialité.
              Cette action est définitive et efface vos données conformément à la politique de confidentialité
              ci-dessous.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">9. Modification des conditions</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Ces conditions peuvent être mises à jour ; la date en haut de cette page indique la dernière
              révision. Une utilisation continue du Service après modification vaut acceptation des nouvelles
              conditions.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">10. Contact</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Pour toute question relative à ces conditions : {CONTACT_EMAIL}
            </p>
          </section>
        </GlassCard>

        <GlassCard id="confidentialite" className="mt-6 scroll-mt-6 space-y-6" hover={false}>
          <h2 className="font-display text-xl font-semibold text-white">Politique de confidentialité</h2>

          <section>
            <h3 className="font-display text-lg font-medium text-white">1. Données collectées</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nous collectons : votre nom et adresse email (à l&apos;inscription), votre mot de passe (jamais
              stocké en clair, uniquement sous forme de hash), les préférences d&apos;affichage (thème, fond
              d&apos;écran), le contenu que vous importez pour publication (images, vidéos, textes), et — lorsque
              vous connectez un compte de réseau social — un jeton d&apos;accès permettant à Nebula d&apos;agir en
              votre nom sur ce compte dans la limite des permissions accordées.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">2. Finalités du traitement</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Ces données servent exclusivement à faire fonctionner le Service : vous authentifier, publier ou
              planifier votre contenu sur les réseaux que vous connectez, afficher vos statistiques, et — si
              vous l&apos;activez — générer des suggestions de texte ou de miniatures via un assistant IA.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">3. Destinataires des données</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vos données ne sont jamais vendues. Elles peuvent être transmises aux services suivants,
              uniquement dans la mesure nécessaire à leur fonction :
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              <li>• Meta (Instagram/Facebook), TikTok, Google/YouTube — pour publier votre contenu et lire vos statistiques, uniquement sur les comptes que vous connectez explicitement.</li>
              <li>• Stripe — pour le traitement des paiements d&apos;abonnement.</li>
              <li>• Resend — pour l&apos;envoi d&apos;emails transactionnels (ex. réinitialisation de mot de passe).</li>
              <li>• Cloudflare (Turnstile) — pour la protection anti-robot à l&apos;inscription.</li>
              <li>• Google (Gemini) — pour les fonctionnalités d&apos;assistant IA, si activées.</li>
              <li>• Notre hébergeur (Vercel) et notre base de données (Neon/PostgreSQL) — pour l&apos;hébergement technique du Service.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">4. Durée de conservation</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vos données sont conservées tant que votre compte est actif. En cas de suppression de compte
              (Paramètres → Compte &amp; confidentialité), vos données personnelles et votre contenu sont
              effacés de nos systèmes, sauf obligation légale contraire.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">5. Sécurité</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Les mots de passe sont hachés (bcrypt) et ne sont jamais stockés ni transmis en clair. Les
              échanges avec le Service sont chiffrés (HTTPS). L&apos;accès aux jetons de connexion aux réseaux
              sociaux est strictement limité aux opérations que vous initiez.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">6. Vos droits</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous pouvez à tout moment consulter, exporter ou supprimer vos données directement depuis
              Paramètres → Compte &amp; confidentialité (téléchargement de vos données au format JSON,
              suppression définitive du compte). Pour toute autre demande relative à vos données, contactez :{" "}
              {CONTACT_EMAIL}
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">7. Cookies</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nebula utilise un cookie de session strictement nécessaire au maintien de votre connexion
              (authentification). Aucun cookie publicitaire ou de traçage tiers n&apos;est utilisé.
            </p>
          </section>

          <section>
            <h3 className="font-display text-lg font-medium text-white">8. Modifications</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Cette politique peut être mise à jour ; la date en haut de cette page indique la dernière
              révision.
            </p>
          </section>
        </GlassCard>
      </div>
    </main>
  );
}
