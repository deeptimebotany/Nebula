// Glyphes des sources d'import de médias (lot 3, 25/09/2026), partagés par
// la barre « Importer depuis » de Publier et la page d'accueil (02/10/2026).
// Dessins simplifiés au trait — sauf Canva, toujours avec son logo officiel
// (06/10/2026, voir canva-icon.tsx). `brand` : logos officiels de Google
// Drive, Dropbox et Unsplash, réservés à l'application (voir brand-logo.tsx).
// Sans hook : utilisable dans un composant serveur.
import type { MediaSourceId } from "@/lib/media-sources";
import { CanvaIcon } from "./canva-icon";
import { BrandLogo, isBrandLogoId } from "./brand-logo";

export function SourceIcon({ id, className = "h-4 w-4", brand = false }: { id: MediaSourceId | "device"; className?: string; brand?: boolean }) {
  if (brand && isBrandLogoId(id)) return <BrandLogo id={id} className={className} />;
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  switch (id) {
    case "device":
      return (
        <svg {...common}>
          <rect x="2.5" y="4.5" width="13" height="10" rx="1.5" />
          <path d="M6 18.5h6M9 14.5v4" />
          <rect x="16.5" y="8.5" width="5" height="11" rx="1.2" />
        </svg>
      );
    case "gdrive":
      return (
        <svg {...common}>
          <path d="M8.5 3.5h7l6 10.5-3.5 6h-12L2.5 14z" />
          <path d="M8.5 3.5 15 14.5M15.5 3.5 9 14.5M2.5 14h19" />
        </svg>
      );
    case "dropbox":
      return (
        <svg {...common}>
          <path d="m7 3.5-4.5 3 4.5 3 5-3zM17 3.5l4.5 3-4.5 3-5-3zM2.5 12.5l4.5 3 5-3-5-3zM21.5 12.5l-4.5 3-5-3 5-3zM7 17l5 3.5 5-3.5" />
        </svg>
      );
    case "onedrive":
      return (
        <svg {...common}>
          <path d="M7 18.5h11a3.5 3.5 0 0 0 .5-7A5.5 5.5 0 0 0 8 9.6 4.5 4.5 0 0 0 7 18.5Z" />
        </svg>
      );
    case "unsplash":
      return (
        <svg {...common}>
          <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" />
          <circle cx="12" cy="12.5" r="3.5" />
          <path d="M8.5 5.5 10 3.5h4l1.5 2" />
        </svg>
      );
    case "canva":
      return <CanvaIcon className={className} />;
  }
}
