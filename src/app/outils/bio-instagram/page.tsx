// Générateur de bio Instagram (brief growth, lot G4.c). 29/09/2026 : démo
// sans IA pour les visiteurs, vraie génération avec un compte. 02/10/2026 :
// générateur partagé avec l'outil de l'application (/tools/bio-instagram).
import { ToolPage } from "@/components/tools/tool-page";
import { BioGenerator } from "@/components/tools/bodies/bio-generator";
import { IconAvatar } from "@/components/dashboard/icons";

const FAQ = [
  { q: "Combien de caractères pour une bio Instagram ?", a: "150 caractères maximum, sauts de ligne compris. Chaque proposition générée respecte cette limite ; les émojis comptent pour un ou deux caractères selon les cas." },
  { q: "Que mettre dans une bio Instagram efficace ?", a: "Ce que vous faites, pour qui, et une raison d'agir (lien, offre, nouveauté). Un mot-clé sur votre activité aide la recherche Instagram ; l'appel à l'action pointe vers le lien de votre bio." },
  { q: "Où mettre plusieurs liens dans ma bio ?", a: "Instagram n'affiche qu'un lien principal. Une page « link in bio » regroupe tous vos liens sur une page : Nebula en propose une, gratuite, avec le suivi des clics." },
  { q: "Ces bios sont-elles uniques ?", a: "Avec un compte (gratuit), elles sont générées par l'IA à partir de votre description : deux personnes n'obtiennent pas la même. Sans compte, la page montre une démo préparée à l'avance. Relisez et adaptez avant de publier." },
  { q: "Faut-il un compte ?", a: "Pour générer vos bios avec l'IA, oui : un compte gratuit suffit, avec 10 générations par jour. Sans compte, vous voyez un exemple préparé à l'avance, sans IA." }
];

export default function BioInstagramPage() {
  return (
    <ToolPage
      icon={<IconAvatar className="h-6 w-6" />}
      title="Générateur de bio Instagram"
      intro={
        <p>
          Votre bio Instagram est lue en une seconde : elle doit dire ce que vous faites, pour qui, et donner une raison de cliquer. Décrivez votre activité, choisissez un ton, ajoutez éventuellement des mots-clés et un appel à l&apos;action : l&apos;IA propose cinq bios de 150 caractères maximum, prêtes à coller. Sans compte, la page montre une démo préparée à l&apos;avance ; avec un compte gratuit, l&apos;IA écrit vos bios (10 générations par jour). Et si votre bio mérite plusieurs liens, Nebula vous offre une page « link in bio » gratuite avec suivi des clics.
        </p>
      }
      faq={FAQ}
      related={[
        { href: "/outils/audit", title: "Audit de présence en ligne" },
        { href: "/outils/hashtags", title: "Générateur de hashtags" },
        { href: "/outils/taux-engagement", title: "Calculateur de taux d'engagement" },
        { href: "/decouvrir/page-bio", title: "Créer une page bio" }
      ]}
      ctaLabel="Créer ma page bio gratuite"
    >
      <BioGenerator />
    </ToolPage>
  );
}
