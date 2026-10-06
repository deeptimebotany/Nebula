// Logos officiels des sources d'import (06/10/2026), dans l'application
// seulement : barre « Importer depuis » de Publier et mention « Importé
// depuis… ». Fichiers fournis par Lucas depuis les pages officielles, copiés
// sans retouche (seulement redimensionnés, et marges transparentes retirées
// pour Unsplash) dans public/brands/. Consignes suivies :
//  - Google Drive (developers.google.com/drive/api/guides/branding) : logo
//    non modifié, sur un bouton qui lance une action avec Drive ou pour
//    indiquer d'où vient un fichier, « Google Drive » en toutes lettres et
//    une infobulle qui dit l'action ;
//  - Dropbox (guide de marque des développeurs) : logo pour identifier ou
//    mener à l'intégration Dropbox, avec le texte de l'action ;
//  - Unsplash : jamais comme icône d'application ; logo noir, blanc en mode
//    sombre (variante monochrome) ;
//  - Canva : voir canva-icon.tsx.
// OneDrive garde son dessin : Microsoft n'autorise pas ses logos sans licence.
// La page d'accueil publique garde les dessins (usage marketing), sauf Canva.
// Sans hook : utilisable dans un composant serveur.
import { clsx } from "@/lib/clsx";

export type BrandLogoId = "gdrive" | "dropbox" | "unsplash";

export const BRAND_LOGOS: Record<BrandLogoId, { src: string; width: number; height: number; mono?: boolean }> = {
  gdrive: { src: "/brands/google-drive/google-drive.png", width: 128, height: 128 },
  dropbox: { src: "/brands/dropbox/dropbox.png", width: 128, height: 119 },
  unsplash: { src: "/brands/unsplash/unsplash.png", width: 128, height: 120, mono: true }
};

export function isBrandLogoId(id: string): id is BrandLogoId {
  return Object.prototype.hasOwnProperty.call(BRAND_LOGOS, id);
}

export function BrandLogo({ id, className }: { id: BrandLogoId; className?: string }) {
  const logo = BRAND_LOGOS[id];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt=""
      aria-hidden="true"
      className={clsx("shrink-0 object-contain", logo.mono && "nb-logo-mono", className)}
    />
  );
}
