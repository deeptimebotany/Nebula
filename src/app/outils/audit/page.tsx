import type { Metadata } from "next";
import { ToolPage } from "@/components/tools/tool-page";
import { AuditForm } from "@/components/audit/audit-form";
import { IconSearch } from "@/components/dashboard/icons";
import { enabledAuditSources } from "@/lib/audit/config";
import { AUDIT_DAILY_LIMIT, AUDIT_RETENTION_DAYS } from "@/lib/audit/types";

// Audit de présence en ligne gratuit (produit n°8), sans compte : page
// pré-générée (vitrine). Les sources proposées dépendent des clés présentes
// au déploiement (YouTube : YOUTUBE_API_KEY ; Instagram : IG_DISCOVERY_*).
// Le rapport s'ouvre sur /audit/<jeton> (CSP stricte, jamais indexé).
export const metadata: Metadata = {
  title: "Audit de présence en ligne gratuit",
  description:
    "Collez les liens de votre chaîne YouTube, de votre Instagram, de votre TikTok ou de votre site : score de présence sur 100, régularité, engagement, cohérence et conseils concrets. Gratuit, sans compte."
};

const FAQ = [
  {
    q: "Quelles données l'audit utilise-t-il ?",
    a: "Uniquement des données publiques : ce que YouTube, Instagram (comptes professionnels), TikTok et votre site montrent à tout le monde. Aucune connexion de compte, aucun mot de passe."
  },
  {
    q: "Comment le score est-il calculé ?",
    a: "Cinq axes (profil, régularité, engagement, contenu, cohérence) notés par des règles affichées dans le rapport, avec des repères de bonnes pratiques choisis par Nebula. Un axe sans données est exclu du score, jamais compté zéro : le rapport dit sur combien d'axes il repose."
  },
  {
    q: "Pourquoi mon compte Instagram n'est-il pas analysé ?",
    a: "Instagram ne rend lisibles que les comptes professionnels (Créateur ou Entreprise). Passer en compte professionnel est gratuit et vous donne aussi vos statistiques."
  },
  {
    q: "Et TikTok ?",
    a: "TikTok ne publie ni les vues ni les abonnés sans connexion du compte : l'audit vérifie que le profil existe et compare son nom aux autres réseaux. Une fois le compte connecté à Nebula, vous suivez tous vos chiffres."
  },
  {
    q: "Puis-je analyser le compte de quelqu'un d'autre ?",
    a: `Oui, tant qu'il est public. Le rapport n'est pas indexé par les moteurs de recherche, son lien est secret, il est supprimé au bout de ${AUDIT_RETENTION_DAYS} jours, et toute personne qui a le lien peut le supprimer.`
  },
  {
    q: "Combien d'audits puis-je lancer ?",
    a: `${AUDIT_DAILY_LIMIT} par jour, gratuitement. Les mêmes comptes analysés dans les 24 heures redonnent le même rapport, sans compter dans la limite.`
  }
];

const RELATED = [
  { href: "/outils/taux-engagement", title: "Calculateur de taux d'engagement" },
  { href: "/outils/titre-youtube", title: "Testeur de titre YouTube" },
  { href: "/outils/bio-instagram", title: "Générateur de bio Instagram" },
  { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" }
];

export default function AuditToolPage() {
  return (
    <ToolPage
      icon={<IconSearch className="h-6 w-6" />}
      title="Audit de présence en ligne gratuit"
      intro={
        <p>
          Collez vos liens : en quelques secondes, un score de présence sur 100, ce qui freine votre visibilité et les actions à faire en premier. Régularité de vos publications,
          engagement, qualité de vos profils, cohérence entre vos réseaux et votre site. Gratuit, sans compte, à partir des seules données publiques.
        </p>
      }
      faq={FAQ}
      related={RELATED}
      ctaLabel="Créer mon espace gratuitement"
      ctaTitle="Suivez vos vrais chiffres, chaque jour"
      ctaText="L'audit ne voit que le public. Connectez vos comptes à Nebula : rétention de vos vidéos, croissance d'abonnés, meilleurs créneaux, statistiques de chaque publication, TikTok compris. Gratuit pour commencer."
    >
      <AuditForm sources={enabledAuditSources()} />
    </ToolPage>
  );
}
