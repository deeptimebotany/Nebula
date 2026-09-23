import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

// Les trois pages d'outils gratuits partagent la navigation et le footer de
// la vitrine (elles n'en avaient aucun) ; chaque page garde son propre
// <main> et son fond.
export default function OutilsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </>
  );
}
