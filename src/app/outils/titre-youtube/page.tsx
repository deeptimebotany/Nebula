// Testeur de titre YouTube (brief growth, lot G4.c) : score heuristique
// LOCAL (longueur, chiffre, mot fort, question, majuscules) toujours
// disponible, même sans compte, et trois reformulations IA. 29/09/2026 :
// reformulations réservées aux comptes (quota par compte) ; sans compte,
// démo préparée à l'avance, sans IA. 02/10/2026 : testeur partagé avec
// l'outil de l'application (/tools/titre-youtube).
import { ToolPage } from "@/components/tools/tool-page";
import { TitleTester } from "@/components/tools/bodies/title-tester";
import { IconYouTube } from "@/components/dashboard/icons";

const FAQ = [
  { q: "Quelle longueur pour un titre YouTube ?", a: "Environ 40 à 60 caractères : au-delà, YouTube tronque le titre dans la plupart des emplacements (recherche, suggestions, mobile), et l'idée principale doit tenir dans les premiers mots." },
  { q: "Le score garantit-il des clics ?", a: "Non. C'est un repère heuristique sur des critères connus (longueur, chiffre, mot fort, question). Le taux de clics dépend surtout du couple titre + miniature et de la promesse tenue dans la vidéo." },
  { q: "Que fait l'IA ici ?", a: "Avec un compte (gratuit), elle propose trois reformulations différentes (avec un chiffre, sous forme de question, avec un mot fort) à partir de votre titre et du sujet — sans clickbait mensonger. Sans compte, vous voyez un exemple préparé à l'avance. Le score, lui, se calcule dans votre navigateur, sans IA et sans compte." },
  { q: "Et pour la miniature ?", a: "Nebula analyse la rétention de vos vidéos YouTube et son assistant explique le pourquoi de chaque choix de miniature (accroche, composition, couleurs). Le générateur de publications de ces outils choisit aussi, avec un compte gratuit, les meilleures images de votre vidéo pour la miniature ; les miniatures retravaillées par l'IA font partie de Pro." }
];

export default function TitreYoutubePage() {
  return (
    <ToolPage
      icon={<IconYouTube className="h-6 w-6" />}
      title="Testeur de titre YouTube"
      intro={
        <p>
          Un bon titre YouTube tient en une ligne, contient une promesse concrète et donne envie de savoir la suite. Collez votre titre : le testeur le note en direct sur cinq critères (longueur, chiffre, mot fort, question ou promesse, majuscules) et vous dit quoi corriger. Ensuite, avec un compte gratuit, l&apos;IA propose trois reformulations plus accrocheuses, sans tomber dans le clickbait (sans compte : une démo préparée à l&apos;avance). Le score se calcule dans votre navigateur, sans compte et sans limite.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/publier", title: "Générateur de publications (miniature comprise)" },
        { href: "/outils/hashtags", title: "Générateur de hashtags" },
        { href: "/outils/meilleur-moment", title: "Meilleur moment pour publier" }
      ]}
    >
      <TitleTester />
    </ToolPage>
  );
}
