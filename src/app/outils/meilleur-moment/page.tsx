// Meilleur moment pour publier (brief growth, lot G4.c) — tableau STATIQUE
// d'ordres de grandeur par réseau, daté et sourcé, converti dans le fuseau
// choisi. Sans IA : n'entame pas le quota Gemini. 02/10/2026 : tableau
// partagé avec l'outil de l'application (/tools/meilleur-moment).
import { ToolPage } from "@/components/tools/tool-page";
import { BestTimeTable } from "@/components/tools/bodies/best-time-table";
import { IconClock } from "@/components/dashboard/icons";

const FAQ = [
  { q: "Ces horaires sont-ils valables pour mon compte ?", a: "Ce sont des moyennes générales, toutes audiences confondues, relevées à une date donnée. Votre audience a ses propres habitudes : un compte B2B et un compte lifestyle n'ont pas les mêmes pics. Vos propres statistiques valent toujours mieux qu'une moyenne." },
  { q: "Comment connaître mes vrais meilleurs créneaux ?", a: "En comparant les performances de vos publications selon leur heure de départ. Nebula récupère les vrais chiffres de chaque publication (onglet Engagements) et ses horaires de publication : vous voyez vite ce qui marche pour VOTRE audience." },
  { q: "Faut-il publier à l'heure exacte ?", a: "Non. Publier 30 à 60 minutes avant le pic laisse le temps à l'algorithme de tester la publication auprès d'un premier cercle. La régularité compte plus que la minute près." }
];

export default function MeilleurMomentPage() {
  return (
    <ToolPage
      icon={<IconClock className="h-6 w-6" />}
      title="Meilleur moment pour publier sur les réseaux sociaux"
      intro={
        <p>
          Il n&apos;existe pas d&apos;heure magique, mais il existe des créneaux où votre audience est plus souvent disponible. Ce tableau rassemble les ordres de grandeur qui reviennent le plus dans les études publiques, réseau par réseau, convertis dans votre fuseau horaire. Servez-vous-en comme point de départ, puis laissez vos propres chiffres trancher : un compte qui parle à des parents n&apos;a pas les mêmes pics qu&apos;un compte de gaming. Nebula programme vos publications à l&apos;heure choisie et vous montre ce que chacune a déclenché.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/taux-engagement", title: "Calculateur de taux d'engagement" },
        { href: "/outils/hashtags", title: "Générateur de hashtags" },
        { href: "/outils/titre-youtube", title: "Testeur de titre YouTube" }
      ]}
      ctaLabel="Mesurez vos vrais meilleurs créneaux"
    >
      <BestTimeTable />
    </ToolPage>
  );
}
