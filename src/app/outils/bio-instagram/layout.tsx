import { JsonLd } from "@/components/seo/json-ld";
import { pageMetadata, toolStructuredData } from "@/lib/seo";
import { SEO_TOOLS } from "@/lib/seo-pages";

// La page de l'outil est un composant client : ce layout porte ses
// métadonnées (titre, description, canonique, aperçus de partage) et ses
// données structurées (WebApplication + fil d'Ariane), définies dans
// src/lib/seo-pages.ts (SEO technique, 29/09/2026).
const PAGE = SEO_TOOLS["bio-instagram"];

export const metadata = pageMetadata(PAGE);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd nodes={toolStructuredData(PAGE)} />
      {children}
    </>
  );
}
