import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { ExplorerHint } from "@/components/tools/explorer-hint";

// Les trois pages d'outils gratuits partagent la navigation et le footer de
// la vitrine (elles n'en avaient aucun) ; chaque page garde son propre
// <main> et son fond. Lot C des Réussites : rappel du badge Explorateur
// (2 outils essayés avant l'inscription) entre l'outil et le pied de page.
export default function OutilsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      {children}
      <ExplorerHint />
      <MarketingFooter />
    </>
  );
}
