import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { IconCheck, IconDownload, IconLock, IconShield, IconUsers } from "@/components/dashboard/icons";
import { SITE_CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sécurité et données",
  description:
    "Comment Nebula protège vos comptes et vos données : connexion officielle OAuth, jetons jamais exposés, chiffrement, export et suppression à tout moment.",
  alternates: { canonical: "/securite" }
};

// Chaque affirmation de cette page correspond à un mécanisme réellement en
// place dans le code (voir les fichiers cités en commentaire), pas à une
// intention : c'est la condition pour qu'une page « sécurité » inspire
// confiance à une agence qui compare des outils.
const PILLARS = [
  {
    icon: IconLock,
    title: "Vos mots de passe de réseaux sociaux ne passent jamais par Nebula",
    body: "La connexion d'un compte Instagram, Facebook, TikTok ou YouTube se fait sur la page d'autorisation officielle de la plateforme (OAuth). Nebula reçoit uniquement un jeton d'accès limité aux permissions que vous accordez — jamais votre identifiant ni votre mot de passe."
    // src/app/api/connections/[provider]/start + callback, état OAuth signé.
  },
  {
    icon: IconShield,
    title: "Les jetons d'accès restent côté serveur",
    body: "Les jetons qui permettent de publier sur vos comptes ne sont jamais renvoyés au navigateur, ni à vous, ni à personne. Ils ne servent qu'aux actions que vous déclenchez : publier, lire vos statistiques, récupérer vos commentaires."
    // src/lib/brand-access.ts (PUBLIC_CONNECTION_SELECT), routes /api/posts.
  },
  {
    icon: IconUsers,
    title: "Chaque marque est cloisonnée",
    body: "Les publications, comptes, statistiques et médias d'une marque ne sont accessibles qu'aux membres de cette marque. Chaque requête vérifie cette appartenance côté serveur, pas seulement dans l'interface."
    // requireBrandMembership / ownedBy sur toutes les routes marque.
  },
  {
    icon: IconDownload,
    title: "Vos données vous appartiennent",
    body: "Exportez l'ensemble de vos données (publications, comptes, statistiques) au format JSON depuis les Paramètres, et supprimez définitivement votre compte en un clic. La suppression efface aussi les jetons de connexion."
    // /api/settings/export, /api/settings/account.
  }
];

const MEASURES: { title: string; items: string[] }[] = [
  {
    title: "Comptes et accès",
    items: [
      "Mots de passe hachés avec bcrypt, jamais stockés ni transmis en clair.",
      "Connexion rapide Google, Apple ou Meta possible : aucun mot de passe Nebula à retenir.",
      "Limitation du nombre de tentatives de connexion, d'inscription et de réinitialisation par adresse, pour bloquer les attaques par force brute.",
      "Protection anti-robot (Cloudflare Turnstile) sur les formulaires publics.",
      "Sessions signées, expirant automatiquement ; déconnexion possible à tout moment."
    ]
  },
  {
    title: "Transport et infrastructure",
    items: [
      "Chiffrement HTTPS sur tout le site, avec HSTS pour empêcher tout retour en clair.",
      "En-têtes de sécurité (protection contre l'affichage dans une page tierce, contrôle des sources autorisées).",
      "Hébergement chez Vercel, base de données PostgreSQL chez Neon, médias chez Vercel Blob — trois prestataires spécialisés, chacun avec ses propres garanties de sécurité et de sauvegarde.",
      "Paiements confiés à Stripe : Nebula ne voit ni ne stocke aucun numéro de carte."
    ]
  },
  {
    title: "Ce que voient vos clients",
    items: [
      "Les rapports et calendriers partagés sont en lecture seule, accessibles par un lien privé que vous pouvez révoquer.",
      "Vos clients n'ont jamais accès à votre espace ni à vos autres marques ; ils n'ont pas de compte à créer.",
      "Les liens d'approbation permettent à un client de valider ou de commenter une publication, sans rien pouvoir publier lui-même."
    ]
  },
  {
    title: "Données et vie privée",
    items: [
      "Aucune revente de données, aucun profilage publicitaire, aucun traceur tiers.",
      "Uniquement des cookies strictement nécessaires : pas de bannière de consentement parce qu'il n'y a rien à consentir.",
      "Les fonctions d'IA ne traitent vos textes et images que lorsque vous les utilisez.",
      "Les empreintes d'adresse IP servant à limiter les abus sont purgées automatiquement sous deux jours."
    ]
  }
];

export default function SecuritePage() {
  return (
    <PublicShell width="max-w-5xl">
      <PublicPageHeading
        eyebrow="Sécurité et données"
        title="Vos comptes restent les vôtres"
        desc={`${SITE_NAME} n'a besoin que du strict nécessaire pour publier et mesurer. Voici, concrètement, comment vos comptes et vos données sont protégés.`}
      />

      <div className="grid gap-5 md:grid-cols-2">
        {PILLARS.map((p) => (
          <GlassCard key={p.title} hover={false} className="h-full">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-aurora-400/30 bg-aurora-400/10 text-aurora-300">
              <p.icon className="h-5 w-5" />
            </div>
            <h2 className="mt-5 font-display text-lg font-medium text-white">{p.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.body}</p>
          </GlassCard>
        ))}
      </div>

      <section className="mt-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-300">En détail</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-white">Les mesures en place</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {MEASURES.map((group) => (
            <div key={group.title} className="rounded-2xl border border-white/[0.06] p-6">
              <h3 className="font-display text-base font-medium text-white">{group.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-400">
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-aurora-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <GlassCard hover={false} className="p-8 sm:p-10">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Une question, un doute, un signalement ?</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Si vous pensez avoir trouvé une faille ou un comportement anormal, écrivez-nous directement : nous
                répondons et corrigeons en priorité. Les détails de traitement de vos données sont dans notre{" "}
                <Link href="/legal#confidentialite" className="text-aurora-300 hover:underline">
                  politique de confidentialité
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <ButtonLink href={`mailto:${SITE_CONTACT_EMAIL}?subject=S%C3%A9curit%C3%A9%20Nebula`} variant="outline">
                Signaler un problème de sécurité
              </ButtonLink>
              <ButtonLink href="/contact" variant="ghost">
                Nous contacter
              </ButtonLink>
            </div>
          </div>
        </GlassCard>
      </section>
    </PublicShell>
  );
}
