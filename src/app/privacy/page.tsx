import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

// Page publique (aucune authentification requise) — voir la note en tête de
// src/app/terms/page.tsx : contenu générique à adapter (nom légal, contact)
// avant une mise en production réelle, ceci n'est pas un avis juridique.

const LAST_UPDATED = "20 septembre 2026";
const CONTACT_EMAIL = "nommelucas@gmail.com";

export const metadata = { title: "Politique de confidentialité — Nebula" };

export default function PrivacyPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm text-aurora-300 hover:underline">
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-4 font-display text-3xl font-semibold text-white">Politique de confidentialité</h1>
        <p className="mt-2 text-sm text-slate-500">Dernière mise à jour : {LAST_UPDATED}</p>

        <GlassCard className="mt-8 space-y-6" hover={false}>
          <section>
            <h2 className="font-display text-lg font-medium text-white">1. Données collectées</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nous collectons : votre nom et adresse email (à l&apos;inscription), votre mot de passe (jamais
              stocké en clair, uniquement sous forme de hash), les préférences d&apos;affichage (thème, fond
              d&apos;écran), le contenu que vous importez pour publication (images, vidéos, textes), et — lorsque
              vous connectez un compte de réseau social — un jeton d&apos;accès permettant à Nebula d&apos;agir en
              votre nom sur ce compte dans la limite des permissions accordées.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">2. Finalités du traitement</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Ces données servent exclusivement à faire fonctionner le Service : vous authentifier, publier ou
              planifier votre contenu sur les réseaux que vous connectez, afficher vos statistiques, et — si
              vous l&apos;activez — générer des suggestions de texte ou de miniatures via un assistant IA.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">3. Destinataires des données</h2>
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
            <h2 className="font-display text-lg font-medium text-white">4. Durée de conservation</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vos données sont conservées tant que votre compte est actif. En cas de suppression de compte
              (Paramètres → Compte &amp; confidentialité), vos données personnelles et votre contenu sont
              effacés de nos systèmes, sauf obligation légale contraire.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">5. Sécurité</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Les mots de passe sont hachés (bcrypt) et ne sont jamais stockés ni transmis en clair. Les
              échanges avec le Service sont chiffrés (HTTPS). L&apos;accès aux jetons de connexion aux réseaux
              sociaux est strictement limité aux opérations que vous initiez.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">6. Vos droits</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vous pouvez à tout moment consulter, exporter ou supprimer vos données directement depuis
              Paramètres → Compte &amp; confidentialité (téléchargement de vos données au format JSON,
              suppression définitive du compte). Pour toute autre demande relative à vos données, contactez :{" "}
              {CONTACT_EMAIL}
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">7. Cookies</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Nebula utilise un cookie de session strictement nécessaire au maintien de votre connexion
              (authentification). Aucun cookie publicitaire ou de traçage tiers n&apos;est utilisé.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-medium text-white">8. Modifications</h2>
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
