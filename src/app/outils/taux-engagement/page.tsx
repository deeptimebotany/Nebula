// Calculateur de taux d'engagement (brief growth, lot G4.c) — SANS IA :
// n'entame pas le quota Gemini. Repères indicatifs datés et sourcés,
// libellés « ordres de grandeur ». 02/10/2026 : le calculateur est partagé
// avec l'outil de l'application (/tools/taux-engagement).
import { ToolPage } from "@/components/tools/tool-page";
import { EngagementCalculator } from "@/components/tools/bodies/engagement-calculator";
import { IconChart } from "@/components/dashboard/icons";

const FAQ = [
  { q: "Comment est calculé le taux d'engagement ?", a: "Interactions moyennes par publication (j'aime + commentaires + partages, divisés par le nombre de publications), rapportées au nombre d'abonnés, en pourcentage. C'est la formule la plus courante ; certains outils utilisent la portée à la place des abonnés, ce qui donne des chiffres plus élevés." },
  { q: "Quel est un bon taux d'engagement ?", a: "Cela dépend fortement du réseau et de la taille du compte : un petit compte engagé dépasse souvent 5 % sur TikTok ou Instagram, un grand compte se situe plutôt autour de 1 %. Les repères affichés sont des ordres de grandeur généraux, datés." },
  { q: "Pourquoi mon taux baisse quand mes abonnés augmentent ?", a: "Mécaniquement : le dénominateur grossit plus vite que les interactions. Regardez plutôt l'évolution des interactions par publication et la portée — Nebula les suit dans Analytics et Engagements." },
  { q: "Nebula peut-il calculer mon vrai taux ?", a: "Oui : une fois vos comptes connectés, l'onglet Engagements récupère les vrais chiffres de chaque publication (vues, j'aime, commentaires, partages, enregistrements) et Analytics suit vos abonnés et votre portée." }
];

export default function TauxEngagementPage() {
  return (
    <ToolPage
      icon={<IconChart className="h-6 w-6" />}
      title="Calculateur de taux d'engagement"
      intro={
        <p>
          Le taux d&apos;engagement dit ce que vos abonnés font vraiment de vos publications : ils passent, ou ils réagissent. Entrez vos abonnés et les interactions d&apos;une ou plusieurs publications, l&apos;outil calcule le taux par publication et le situe face aux ordres de grandeur de chaque réseau. Aucun compte, aucune donnée envoyée à une IA : tout se calcule dans votre navigateur. Pour suivre vos vrais chiffres au fil des semaines, Nebula les récupère automatiquement depuis vos comptes connectés.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" },
        { href: "/outils/hashtags", title: "Générateur de hashtags" },
        { href: "/outils/publier", title: "Générateur de publications" }
      ]}
      ctaLabel="Mesurer mon vrai taux avec Nebula"
    >
      <EngagementCalculator />
    </ToolPage>
  );
}
