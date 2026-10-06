// Générateur de hashtags (brief growth, lot G4.c). 29/09/2026 : démo sans
// IA pour les visiteurs, vraie génération avec un compte. 02/10/2026 :
// générateur partagé avec l'outil de l'application (/tools/hashtags).
import { ToolPage } from "@/components/tools/tool-page";
import { HashtagGenerator } from "@/components/tools/bodies/hashtag-generator";
import { IconHash } from "@/components/dashboard/icons";

const FAQ = [
  { q: "Combien de hashtags utiliser ?", a: "Instagram en accepte 30, mais 5 à 10 bien choisis suffisent souvent ; TikTok et YouTube en utilisent 3 à 5 ; Facebook 1 ou 2. Mélangez des hashtags larges, moyens et de niche plutôt que d'empiler les plus populaires." },
  { q: "Pourquoi trois groupes ?", a: "Les hashtags larges donnent de la visibilité mais beaucoup de concurrence ; les moyens touchent une communauté engagée ; les hashtags de niche sont précis et peu disputés — c'est souvent là que se trouvent vos futurs abonnés." },
  { q: "Les hashtags générés sont-ils vérifiés ?", a: "Ils sont proposés par l'IA à partir de votre thématique : vérifiez rapidement qu'ils existent bien et qu'ils ne sont pas détournés avant de publier." },
  { q: "Faut-il un compte ?", a: "Pour générer vos hashtags avec l'IA, oui : un compte gratuit suffit, avec 10 générations par jour. Sans compte, vous voyez un exemple préparé à l'avance, sans IA." },
  { q: "Nebula peut-il retenir mes hashtags ?", a: "Le Composer de Nebula insère vos hashtags dans vos publications et l'assistant IA en propose d'adaptés à chaque réseau, à partir de vos vraies publications." }
];

export default function HashtagsPage() {
  return (
    <ToolPage
      icon={<IconHash className="h-6 w-6" />}
      title="Générateur de hashtags"
      intro={
        <p>
          Les bons hashtags ne sont pas les plus gros : ce sont ceux où votre publication a une chance d&apos;être vue par les bonnes personnes. Indiquez votre thématique et, si vous voulez, le réseau visé : l&apos;IA propose trois groupes — larges pour la visibilité, moyens pour la communauté, de niche pour se démarquer — à copier en un clic. Sans compte, la page montre une démo préparée à l&apos;avance ; avec un compte gratuit, l&apos;IA génère les vôtres (10 par jour). Dans Nebula, l&apos;assistant fait la même chose à partir de vos vraies publications, et le Composer les insère directement.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/titre-youtube", title: "Testeur de titre YouTube" },
        { href: "/outils/bio-instagram", title: "Générateur de bio Instagram" },
        { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" }
      ]}
    >
      <HashtagGenerator />
    </ToolPage>
  );
}
