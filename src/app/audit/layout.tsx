import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

// Rapports de l'audit de présence (produit n°8) : navigation et pied de page
// de la vitrine, mais CSP stricte (données de comptes tiers affichées),
// donc rendus à chaque visite (voir src/lib/csp.ts, USER_CONTENT_PREFIXES).
export const dynamic = "force-dynamic";

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </>
  );
}
