import type { Metadata } from "next";
import { GlassCard } from "@/components/ui/glass-card";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { SITE_CONTACT_EMAIL, SITE_LEGAL, SITE_NAME, SITE_URL } from "@/lib/site";

// Page publique combinée (aucune authentification requise) : mentions
// légales, conditions d'utilisation et politique de confidentialité sur une
// seule adresse, avec des ancres (#mentions / #conditions /
// #confidentialite). Certains formulaires de plateforme (ex. TikTok
// Developer Portal) ne proposent qu'UN SEUL champ d'URL « legal » ; /terms et
// /privacy restent des adresses valides (redirections permanentes vers ces
// ancres, voir next.config.js) pour ceux qui demandent deux URLs.
//
// Les informations d'éditeur viennent de SITE_LEGAL (variables
// d'environnement, voir .env.example) : tant qu'elles ne sont pas
// renseignées, la page l'indique honnêtement plutôt que d'afficher des
// valeurs inventées. Ceci n'est pas un avis juridique.

const LAST_UPDATED = "25 septembre 2026";

export const metadata: Metadata = {
  title: "Mentions légales, conditions et confidentialité",
  description: `Mentions légales, conditions d'utilisation et politique de confidentialité du service ${SITE_NAME}.`
};

const SUBPROCESSORS: { name: string; role: string; where: string }[] = [
  { name: "Vercel Inc.", role: "Hébergement du site et exécution du service", where: "États-Unis / Union européenne" },
  { name: "Neon Inc.", role: "Base de données (PostgreSQL)", where: "Selon la région choisie à la création" },
  { name: "Vercel Blob", role: "Stockage des médias importés (images, vidéos)", where: "États-Unis / Union européenne" },
  { name: "Meta Platforms, TikTok, Google (YouTube)", role: "Publication et lecture des statistiques, uniquement sur les comptes que vous connectez ; lecture des données publiques des comptes indiqués dans l'audit de présence", where: "Selon la plateforme" },
  { name: "Stripe", role: "Paiement des abonnements (Nebula ne voit jamais votre numéro de carte)", where: "Union européenne / États-Unis" },
  { name: "Resend", role: "Envoi des emails transactionnels (réinitialisation de mot de passe, rapports)", where: "États-Unis" },
  { name: "Cloudflare (Turnstile)", role: "Protection anti-robot des formulaires publics", where: "Réseau mondial" },
  { name: "Google (Gemini)", role: "Assistant IA, uniquement si vous utilisez ces fonctions (dont les conseils de l'audit de présence, rédigés à partir des chiffres du rapport, et le Studio IA, qui reçoit les titres et les statistiques calculées de vos publications, jamais vos identifiants)", where: "États-Unis / Union européenne" }
];

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h3 className="font-display text-lg font-medium text-white">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-white/[0.06] py-2.5 last:border-b-0 sm:grid-cols-[200px_1fr]">
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-300">{value}</dd>
    </div>
  );
}

export default function LegalPage() {
  const registered = Boolean(SITE_LEGAL.publisherName && SITE_LEGAL.siren);
  const pending = (
    <span className="text-slate-500">
      En cours d&apos;immatriculation — cette information sera complétée dès réception du numéro d&apos;identification.
    </span>
  );

  return (
    <PublicShell width="max-w-3xl">
      <PublicPageHeading
        eyebrow="Informations légales"
        title="Mentions légales, conditions et confidentialité"
        desc={
          <>
            Dernière mise à jour : {LAST_UPDATED}. Ces pages sont écrites pour être lues : en français clair, sans
            promesse que le service ne tient pas.
          </>
        }
      />

      <nav aria-label="Sommaire" className="mb-8 flex flex-wrap justify-center gap-2 text-sm">
        {[
          ["#mentions", "Mentions légales"],
          ["#conditions", "Conditions d'utilisation"],
          ["#confidentialite", "Confidentialité"],
          ["#cookies", "Cookies"]
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-slate-300 transition hover:border-white/25 hover:text-white">
            {label}
          </a>
        ))}
      </nav>

      {/* ---------------- Mentions légales ---------------- */}
      <GlassCard id="mentions" className="scroll-mt-24 space-y-6" hover={false}>
        <h2 className="font-display text-xl font-semibold text-white">Mentions légales</h2>
        <dl>
          <Row label="Site" value={<a href={SITE_URL} className="text-aurora-300 hover:underline">{SITE_URL.replace(/^https?:\/\//, "")}</a>} />
          <Row label="Éditeur" value={registered ? SITE_LEGAL.publisherName : pending} />
          <Row label="Forme juridique" value={SITE_LEGAL.publisherForm} />
          <Row label="Immatriculation" value={SITE_LEGAL.siren ? `SIREN ${SITE_LEGAL.siren}` : pending} />
          <Row label="Adresse" value={SITE_LEGAL.address || pending} />
          <Row label="Responsable de la publication" value={SITE_LEGAL.publicationDirector || SITE_LEGAL.publisherName || pending} />
          <Row label="Contact" value={<a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 hover:underline">{SITE_CONTACT_EMAIL}</a>} />
          <Row
            label="Hébergement"
            value={
              <>
                {SITE_LEGAL.host.name}, {SITE_LEGAL.host.address} —{" "}
                <a href={SITE_LEGAL.host.url} className="text-aurora-300 hover:underline" rel="noreferrer" target="_blank">
                  {SITE_LEGAL.host.url.replace(/^https?:\/\//, "")}
                </a>
                . Base de données : {SITE_LEGAL.database.name} (
                <a href={SITE_LEGAL.database.url} className="text-aurora-300 hover:underline" rel="noreferrer" target="_blank">
                  {SITE_LEGAL.database.url.replace(/^https?:\/\//, "")}
                </a>
                ).
              </>
            }
          />
        </dl>
        <p className="text-xs text-slate-500">
          Les noms Instagram, Facebook, TikTok et YouTube appartiennent à leurs propriétaires respectifs. {SITE_NAME}{" "}
          est un service indépendant qui utilise leurs interfaces de programmation officielles ; il n&apos;est ni
          affilié ni certifié par ces plateformes.
        </p>
      </GlassCard>

      {/* ---------------- Conditions d'utilisation ---------------- */}
      <GlassCard id="conditions" className="mt-6 scroll-mt-24 space-y-6" hover={false}>
        <h2 className="font-display text-xl font-semibold text-white">Conditions d&apos;utilisation</h2>

        <Section title="1. Objet">
          <p>
            Les présentes conditions régissent l&apos;utilisation de {SITE_NAME} (le « Service »), un outil de
            gestion, planification et publication de contenu sur des réseaux sociaux tiers (Instagram, Facebook,
            TikTok, YouTube), d&apos;analyse de statistiques et de partage de rapports. En créant un compte, vous
            acceptez ces conditions et la politique de confidentialité ci-dessous.
          </p>
        </Section>

        <Section title="2. Description du service">
          <p>
            {SITE_NAME} permet de connecter vos comptes de réseaux sociaux via les API officielles de chaque
            plateforme, de préparer, planifier et publier du contenu, de consulter des statistiques de performance et
            de partager des rapports ou un calendrier avec vos clients par lien privé. Le Service ne publie ni ne
            modifie votre contenu sans action explicite de votre part (programmation ou publication immédiate).
          </p>
        </Section>

        <Section title="3. Compte utilisateur">
          <p>
            Vous devez avoir au moins 18 ans ou l&apos;autorisation d&apos;un représentant légal. Vous êtes
            responsable de la confidentialité de votre mot de passe et de toute activité effectuée depuis votre
            compte. Vous devez fournir une adresse email valide et nous informer de toute utilisation non autorisée.
          </p>
        </Section>

        <Section title="4. Connexion à des plateformes tierces">
          <p>
            Lorsque vous connectez un compte Instagram, Facebook, TikTok ou YouTube, vous autorisez {SITE_NAME} à
            accéder à ce compte dans les limites des permissions accordées lors de l&apos;autorisation officielle
            (OAuth), uniquement pour exécuter les actions que vous demandez (publication, lecture de statistiques,
            lecture des commentaires). Votre usage de ces réseaux reste soumis à leurs propres conditions. Vous pouvez
            révoquer cet accès à tout moment depuis la page « Comptes » de {SITE_NAME} ou depuis les paramètres du
            réseau concerné.
          </p>
        </Section>

        <Section title="5. Contenu publié">
          <p>
            Vous restez seul responsable du contenu (textes, images, vidéos) que vous importez et publiez via le
            Service, et devez disposer de tous les droits nécessaires sur ce contenu. {SITE_NAME} ne revendique
            aucune propriété sur votre contenu et ne le publie que sur les comptes et selon la programmation que vous
            avez définis. Tout contenu illicite, trompeur ou contraire aux règles des plateformes peut entraîner la
            suspension du compte.
          </p>
        </Section>

        <Section title="6. Paliers, quotas et paiement">
          <p>
            Le palier Gratuit est limité (nombre de marques, de comptes connectés et de publications par mois,
            indiqué sur la page Tarifs). Les paliers Pro et Agence sont des abonnements mensuels ou annuels facturés
            via Stripe ; le prix dépend du nombre de marques choisi. Vous pouvez changer de palier ou résilier à tout
            moment depuis la page Facturation ; la résiliation prend effet à la fin de la période déjà payée, sans
            remboursement au prorata sauf obligation légale contraire.
          </p>
        </Section>

        <Section title="7. Assistant IA">
          <p>
            Les fonctions d&apos;assistant IA (suggestions de titres, légendes, idées, analyse de vidéos) sont
            optionnelles et produisent des propositions que vous restez libre de modifier ou d&apos;ignorer. Elles
            peuvent contenir des erreurs : vérifiez tout contenu avant publication.
          </p>
        </Section>

        <Section title="8. Disponibilité du service">
          <p>
            Le Service est fourni « en l&apos;état », au mieux de nos efforts, sans garantie de disponibilité
            continue. Certaines fonctionnalités dépendent d&apos;API tierces (réseaux sociaux, IA, paiement) dont la
            disponibilité, les quotas ou les conditions peuvent changer indépendamment de notre volonté. Notre
            responsabilité ne saurait être engagée pour une publication non effectuée du fait d&apos;une plateforme
            tierce.
          </p>
        </Section>

        <Section title="9. Résiliation et suppression du compte">
          <p>
            Vous pouvez supprimer votre compte à tout moment depuis Paramètres → Compte &amp; confidentialité. Cette
            action est définitive et efface vos données conformément à la politique de confidentialité ci-dessous.
          </p>
          <p>
            Si vous retirez Nebula des réglages de Facebook, d&apos;Instagram ou de Threads, les comptes concernés sont
            déconnectés ; si vous y demandez aussi la suppression de vos données, Nebula efface celles qui en
            proviennent et vous donne un code de suivi (page <a href="/suppression-donnees" className="text-aurora-300 hover:underline">Suppression de vos données</a>).
          </p>
        </Section>

        <Section title="10. Modification des conditions">
          <p>
            Ces conditions peuvent être mises à jour ; la date en haut de cette page indique la dernière révision.
            En cas de changement important, vous en serez informé par email ou dans l&apos;application.
          </p>
        </Section>

        <Section title="11. Droit applicable et contact">
          <p>
            Les présentes conditions sont soumises au droit français. Pour toute question :{" "}
            <a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 hover:underline">
              {SITE_CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </GlassCard>

      {/* ---------------- Confidentialité ---------------- */}
      <GlassCard id="confidentialite" className="mt-6 scroll-mt-24 space-y-6" hover={false}>
        <h2 className="font-display text-xl font-semibold text-white">Politique de confidentialité</h2>

        <Section title="1. Responsable du traitement">
          <p>
            Le responsable du traitement est l&apos;éditeur du Service indiqué dans les mentions légales ci-dessus,
            joignable à{" "}
            <a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 hover:underline">
              {SITE_CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="2. Données collectées">
          <p>
            À l&apos;inscription : votre nom, votre adresse email et votre mot de passe (jamais stocké en clair,
            uniquement sous forme hachée), ou l&apos;identifiant fourni par Google, Apple ou Meta si vous utilisez la
            connexion rapide. En utilisant le Service : le nom de vos marques, le contenu que vous importez pour
            publication (images, vidéos, textes), vos préférences d&apos;affichage, et — lorsque vous connectez un
            compte de réseau social — un jeton d&apos;accès permettant à {SITE_NAME} d&apos;agir en votre nom sur ce
            compte dans la limite des permissions accordées, ainsi que les statistiques et commentaires que ces
            plateformes renvoient. Pour la sécurité : l&apos;empreinte (hachage) de votre adresse IP, conservée au
            plus deux jours, pour limiter les tentatives abusives sur les formulaires publics.
          </p>
          <p>
            Audit de présence en ligne (outil gratuit, sans compte) : les comptes et le site que vous indiquez, les
            données publiques que ces plateformes et ce site affichent à tout le monde (profil, dernières publications
            et leurs chiffres publics), et le rapport qui en résulte. L&apos;adresse email, facultative, sert
            uniquement à vous envoyer le lien du rapport et n&apos;est pas conservée avec lui ; si vous cochez aussi
            la case des conseils, elle est enregistrée après votre confirmation par email.
          </p>
        </Section>

        <Section title="3. Finalités et bases légales">
          <p>
            Ces données servent à faire fonctionner le Service que vous avez demandé (exécution du contrat) : vous
            authentifier, publier ou planifier votre contenu, afficher vos statistiques, partager vos rapports. La
            protection contre les abus et la sécurité du Service relèvent de notre intérêt légitime. Les fonctions
            d&apos;assistant IA ne traitent vos textes et images que lorsque vous les déclenchez. Nous ne faisons ni
            profilage publicitaire, ni revente de données.
          </p>
          <p>
            L&apos;audit de présence produit le rapport que vous demandez, à partir de données publiques ; il peut
            porter sur le compte d&apos;une autre personne (intérêt légitime : analyse de présence publique). Le
            rapport n&apos;est accessible que par son lien secret, n&apos;est pas indexé par les moteurs de recherche,
            et toute personne qui a ce lien, dont la personne analysée, peut le supprimer depuis le rapport.
          </p>
          <p>
            Le media kit d&apos;une marque n&apos;est public que si vous le publiez : il affiche les chiffres des comptes
            que vous choisissez, votre texte et, si vous la renseignez, votre adresse e-mail de contact. Vous pouvez le
            retirer à tout moment. Ses ouvertures sont comptées sans cookie : l&apos;empreinte de l&apos;adresse IP
            d&apos;un visiteur sert seulement à ne le compter qu&apos;une fois par jour, et suit la même purge que les
            autres empreintes anti-abus.
          </p>
        </Section>

        <Section title="4. Destinataires et sous-traitants">
          <p>
            Vos données ne sont jamais vendues. Elles sont transmises aux prestataires suivants, uniquement dans la
            mesure nécessaire à leur fonction :
          </p>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Prestataire</th>
                  <th className="pb-2 pr-3 font-medium">Rôle</th>
                  <th className="pb-2 font-medium">Localisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {SUBPROCESSORS.map((s) => (
                  <tr key={s.name}>
                    <td className="py-2 pr-3 text-slate-300">{s.name}</td>
                    <td className="py-2 pr-3">{s.role}</td>
                    <td className="py-2">{s.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Certains de ces prestataires sont établis hors de l&apos;Union européenne. Les transferts sont encadrés
            par les garanties prévues par le RGPD (clauses contractuelles types de la Commission européenne et/ou
            certification au cadre de protection des données UE–États-Unis, selon le prestataire).
          </p>
        </Section>

        <Section title="5. Durée de conservation">
          <p>
            Vos données sont conservées tant que votre compte est actif. En cas de suppression du compte (Paramètres
            → Compte &amp; confidentialité), vos données personnelles, vos contenus et les jetons de connexion sont
            effacés de nos systèmes ; les données de facturation sont conservées par Stripe et par nous le temps
            requis par la loi. Les empreintes d&apos;adresse IP anti-abus sont purgées sous deux jours. Les rapports
            d&apos;audit de présence sont supprimés automatiquement au bout de 30 jours.
          </p>
        </Section>

        <Section title="6. Sécurité">
          <p>
            Les mots de passe sont hachés (bcrypt) et ne sont jamais stockés ni transmis en clair. Les échanges avec
            le Service sont chiffrés (HTTPS, HSTS). Les jetons d&apos;accès aux réseaux sociaux ne sont jamais
            renvoyés au navigateur et ne servent qu&apos;aux opérations que vous initiez. L&apos;accès aux données
            d&apos;une marque est réservé aux membres de cette marque.
          </p>
        </Section>

        <Section title="7. Vos droits">
          <p>
            Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation,
            d&apos;opposition et de portabilité de vos données. La plupart s&apos;exercent directement depuis
            Paramètres → Compte &amp; confidentialité (export de vos données au format JSON, suppression définitive
            du compte, déconnexion de chaque réseau). Pour toute autre demande, écrivez à{" "}
            <a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 hover:underline">
              {SITE_CONTACT_EMAIL}
            </a>
            . Vous pouvez également introduire une réclamation auprès de la CNIL (
            <a href="https://www.cnil.fr" className="text-aurora-300 hover:underline" rel="noreferrer" target="_blank">
              www.cnil.fr
            </a>
            ).
          </p>
        </Section>

        <Section id="cookies" title="8. Cookies et stockage local">
          <p>
            {SITE_NAME} utilise uniquement des cookies techniques : le cookie de session qui maintient
            votre connexion, un cookie technique pour retenir le compte actif si vous en utilisez plusieurs, et un
            cookie qui retient la marque que vous avez choisie dans l&apos;application (pour l&apos;afficher dès le
            chargement). Sur les outils gratuits, un cookie « outils essayés » (30 jours) retient seulement le nom des
            outils que vous avez utilisés, pour vous offrir le badge Explorateur si vous créez ensuite un compte ; il ne
            contient aucun identifiant et ne sert à rien d&apos;autre. Vos préférences d&apos;affichage (thème, fond) sont
            mémorisées dans votre navigateur. Aucun cookie publicitaire, de mesure d&apos;audience tierce ou de traçage
            n&apos;est déposé ; aucune bannière de consentement n&apos;est donc nécessaire.
          </p>
        </Section>

        <Section title="9. Modifications">
          <p>
            Cette politique peut être mise à jour ; la date en haut de cette page indique la dernière révision.
          </p>
        </Section>
      </GlassCard>
    </PublicShell>
  );
}
