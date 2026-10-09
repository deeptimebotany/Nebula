import Link from "next/link";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { IconCheck } from "@/components/dashboard/icons";
import { AI_MONTHLY, PLANS, PLAN_LIMITS } from "@/lib/plans";
import { SITE_CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd, pageMetadata } from "@/lib/seo";
import { SEO_HELP_ASSISTANT } from "@/lib/seo-pages";

export const metadata = pageMetadata(SEO_HELP_ASSISTANT);

// Aide « À propos de Demander à Nebula » (09/10/2026, demande de Lucas) :
// la page ouverte par « En savoir plus » sous le chat de l'assistant, sur le
// modèle de l'aide « À propos de Demander à Studio » de YouTube. Chaque
// affirmation correspond au code :
//   - quotas : AI_MONTHLY (src/lib/plans.ts), rafale de 30 messages en
//     10 minutes (src/app/api/ai/chat/route.ts) ;
//   - données envoyées à Gemini : seulement ce que le module de l'onglet
//     demande (needs, src/lib/ai/assistant-prompts.ts), 10 derniers messages ;
//   - conversations (09/10/2026) : gardées d'une page à l'autre, enregistrées
//     sur le serveur pour « Discussions », par personne et par marque,
//     supprimables, effacées après 90 jours sans message
//     (src/lib/ai/assistant-conversations.ts) ; rien dans le navigateur.

/** Paliers où l'assistant est inclus, avec leur nombre de messages. */
const ASSISTANT_QUOTAS = PLANS.filter((p) => AI_MONTHLY[p].assistant > 0).map((p) => ({
  label: PLAN_LIMITS[p].label,
  messages: AI_MONTHLY[p].assistant,
  // L'essai compte ses messages sur toute sa durée, les abonnements par mois.
  period: PLAN_LIMITS[p].aiBudgetBucket === "trial" ? "pendant tout l'essai" : "par mois"
}));
const WITHOUT_ASSISTANT = PLANS.filter((p) => AI_MONTHLY[p].assistant === 0).map((p) => PLAN_LIMITS[p].label);

const PAGES_HELP: { page: string; help: string }[] = [
  { page: "Publier", help: "trouver un titre qui accroche, écrire ou raccourcir une description, choisir les hashtags et le bon réseau. Dans la section Miniature, « Générer 3 miniatures » regarde votre vidéo et propose 3 images, avec la raison de chaque choix." },
  { page: "Analytics et Engagements", help: "lire vos vrais chiffres (abonnés, portée, vues, partages) et vous dire ce qui progresse, ce qui bloque et quoi faire ensuite." },
  { page: "Calendrier", help: "trouver les meilleurs créneaux et équilibrer la semaine entre vos réseaux." },
  { page: "Commentaires", help: "répondre avec le bon ton, gérer une critique ou transformer une question en idée de contenu." },
  { page: "Page bio et Media kit", help: "écrire une présentation qui donne envie et choisir l'ordre de vos liens." },
  { page: "Rapports", help: "rédiger le résumé pour votre client et expliquer une baisse sans jargon." },
  { page: "Rétention IA", help: "expliquer une courbe de rétention et comment garder vos spectateurs plus longtemps." },
  { page: "Partout ailleurs", help: "vous guider dans Nebula : où trouver un réglage, comment connecter un réseau, ce que comprend votre palier." }
];

const GOOD_PRACTICES: { title: string; body: React.ReactNode }[] = [
  {
    title: "Partez d'un objectif clair",
    body: "Demandez-vous ce que vous voulez obtenir : un titre, une explication sur un chiffre, une idée pour votre prochaine publication ?"
  },
  {
    title: "Soyez précis",
    body: (
      <>
        Plus la question est précise, plus la réponse sera utile. Au lieu de « Aide-moi pour ma vidéo », essayez « Propose 5 titres de moins de 60
        caractères pour ma vidéo sur le latte art ».
      </>
    )
  },
  {
    title: "Commencez par une suggestion",
    body: "Les suggestions proposées sous l'accueil changent avec la page où vous êtes. Choisissez-en une, puis affinez la réponse avec une deuxième question."
  },
  {
    title: "Reformulez si besoin",
    body: "Si la réponse ne vous convient pas, dites ce qui ne va pas (« plus court », « plus drôle », « pour TikTok ») : l'assistant tient compte de la conversation en cours."
  }
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[color:var(--nb-sep)] pt-8">
      <h2 className="font-display text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-[color:var(--nb-sep)] bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-slate-400">{children}</p>;
}

export default function AideDemanderANebulaPage() {
  return (
    <PublicShell width="max-w-3xl">
      <JsonLd
        nodes={[
          breadcrumbLd([
            ["Accueil", "/"],
            ["À propos de Demander à Nebula", SEO_HELP_ASSISTANT.path]
          ])
        ]}
      />
      <PublicPageHeading
        eyebrow="Aide"
        title="À propos de Demander à Nebula"
        align="left"
        desc={`Demander à Nebula est l'assistant IA intégré à ${SITE_NAME}. Il vous aide à écrire vos publications, à comprendre vos statistiques et à vous repérer dans l'application. Il sait sur quelle page vous êtes et ne s'appuie que sur les vraies données de votre marque.`}
      />

      <div className="space-y-12">
        <Section id="acces" title="Qui peut l'utiliser">
          <p>L&apos;assistant est inclus dans ces paliers :</p>
          <ul className="space-y-2">
            {ASSISTANT_QUOTAS.map((q) => (
              <li key={q.label} className="flex items-start gap-2.5">
                <IconCheck className="mt-1 h-4 w-4 shrink-0 text-aurora-300" />
                <span>
                  <strong className="font-medium text-white">{q.label}</strong> : {q.messages} messages {q.period}.
                </span>
              </li>
            ))}
          </ul>
          {WITHOUT_ASSISTANT.length > 0 && <p>Il n&apos;est pas inclus dans le palier {WITHOUT_ASSISTANT.join(", ")} : le bouton n&apos;y apparaît pas.</p>}
          <p>
            Les messages des abonnements repartent à zéro le 1er de chaque mois. Pour qu&apos;une rafale ne vide pas le quota, l&apos;assistant marque
            aussi une courte pause après 30 messages en 10 minutes : un compte à rebours s&apos;affiche.
          </p>
          <p>Il fonctionne sur ordinateur comme sur téléphone, et répond en français.</p>
          <Note>
            Les réponses de l&apos;assistant sont produites par une IA : leur qualité peut varier et elles peuvent contenir des erreurs. Ne vous y fiez
            pas pour un conseil professionnel, notamment juridique, financier ou médical.
          </Note>
        </Section>

        <Section id="premiers-pas" title="Premiers pas">
          <ol className="list-decimal space-y-2 pl-5 marker:text-slate-500">
            <li>Connectez-vous à {SITE_NAME}.</li>
            <li>
              En haut à droite, cliquez sur l&apos;étoile <strong className="font-medium text-white">Demander à Nebula</strong>. Le panneau s&apos;ouvre
              à droite de la page.
            </li>
            <li>Choisissez une des suggestions, ou écrivez votre question puis appuyez sur Entrée (Maj + Entrée pour aller à la ligne).</li>
            <li>Pour fermer le panneau, cliquez sur la croix ou appuyez sur Échap.</li>
          </ol>
          <p>L&apos;assistant adapte ses suggestions et ses réponses à la page ouverte :</p>
          <ul className="space-y-2">
            {PAGES_HELP.map((p) => (
              <li key={p.page} className="flex items-start gap-2.5">
                <IconCheck className="mt-1 h-4 w-4 shrink-0 text-aurora-300" />
                <span>
                  <strong className="font-medium text-white">{p.page}</strong> : {p.help}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="bonnes-pratiques" title="Bien formuler vos demandes">
          <div className="grid gap-4 sm:grid-cols-2">
            {GOOD_PRACTICES.map((g) => (
              <div key={g.title} className="rounded-2xl border border-[color:var(--nb-sep)] p-5">
                <h3 className="font-display text-base font-medium text-white">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{g.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="conversation" title="Votre conversation">
          <p>
            La conversation vous suit d&apos;une page à l&apos;autre : vous pouvez fermer le panneau et le rouvrir, elle est toujours là. Quand vous
            rechargez la page, quittez {SITE_NAME} ou changez de marque, le panneau s&apos;ouvre sur une nouvelle conversation. Le bouton « Nouvelle
            conversation », à côté de la croix, en commence une à tout moment.
          </p>
          <p>
            Vos conversations passées sont dans « Discussions » : le bouton à trois traits, en haut à gauche du panneau. Vous pouvez en rouvrir une
            pour la continuer, ou la supprimer. Elles sont rangées par marque, visibles par vous seul (pas par les autres membres de la marque), et
            effacées automatiquement 90 jours après leur dernier message. Seul le texte est gardé : les miniatures proposées dans le chat ne le sont pas.
          </p>
        </Section>

        <Section id="donnees" title="Données et confidentialité">
          <p>Pour vous répondre, {SITE_NAME} envoie à Google Gemini, par son API payante :</p>
          <ul className="list-disc space-y-1.5 pl-5 marker:text-slate-500">
            <li>votre question et les 10 derniers messages de la conversation ;</li>
            <li>
              seulement les données de votre marque utiles à la page ouverte : son nom, les derniers chiffres de vos comptes connectés, vos
              dernières publications, votre page bio ou la publication que vous consultez.
            </li>
          </ul>
          <p>
            Jamais vos mots de passe ni vos identifiants. Avec l&apos;API payante, Google n&apos;utilise pas ces contenus pour améliorer ses produits et ne
            les garde que peu de temps, pour détecter les abus. Tous les détails sont dans notre{" "}
            <Link href="/legal#confidentialite" className="text-aurora-300 underline-offset-2 hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
          <Note>N&apos;écrivez pas dans le chat d&apos;informations confidentielles : mots de passe, coordonnées bancaires, données de santé.</Note>
        </Section>

        <Section id="responsabilite" title="Vous restez responsable de ce que vous publiez">
          <p>
            L&apos;IA peut se tromper, même quand elle a l&apos;air sûre d&apos;elle. Relisez chaque texte avant de le publier, vérifiez les chiffres, les noms
            et les faits, et assurez-vous qu&apos;il respecte les règles de chaque réseau. Les propositions de l&apos;assistant sont des suggestions : vous
            restez libre de les modifier ou de les ignorer.
          </p>
        </Section>

        <Section id="contact" title="Une question ou un problème ?">
          <p>
            Une réponse étrange, un bug, une idée pour améliorer l&apos;assistant ? Écrivez-nous depuis la{" "}
            <Link href="/contact" className="text-aurora-300 underline-offset-2 hover:underline">
              page Contact
            </Link>{" "}
            ou à{" "}
            <a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 underline-offset-2 hover:underline">
              {SITE_CONTACT_EMAIL}
            </a>
            . Chaque message reçoit une réponse personnelle.
          </p>
        </Section>
      </div>
    </PublicShell>
  );
}
