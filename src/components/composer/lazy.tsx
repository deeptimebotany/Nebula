"use client";

// Morceaux de la page Publier chargés à la demande (lot 5).
//
// La page embarquait d'un coup l'aperçu par réseau (~1 500 lignes, avec
// framer-motion), les panneaux rarement ouverts (recyclage IA, lien de
// campagne, lieu), le voile d'envoi et le mini-jeu d'attente. Ici, chacun
// devient un morceau séparé :
//  - l'aperçu est téléchargé juste après l'affichage du formulaire, avec un
//    cadre de même taille entre-temps ;
//  - les panneaux ne sont téléchargés qu'à leur première ouverture (le
//    composant parent ne les monte que lorsqu'ils sont ouverts).
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

function PreviewSkeleton() {
  return (
    <div aria-hidden="true" className="glass-panel space-y-3 rounded-2xl p-4">
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded-lg" />
        ))}
      </div>
      <Skeleton className="mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-[320px] rounded-2xl" />
    </div>
  );
}

export const ComposerPreview = dynamic(() => import("./composer-preview").then((m) => m.ComposerPreview), {
  ssr: false,
  loading: PreviewSkeleton
});

export const RepurposePanel = dynamic(() => import("./repurpose-panel").then((m) => m.RepurposePanel), { ssr: false });

export const CampaignLinkBuilder = dynamic(() => import("./campaign-link-builder").then((m) => m.CampaignLinkBuilder), { ssr: false });

export const LocationPicker = dynamic(() => import("./location-picker").then((m) => m.LocationPicker), { ssr: false });

export const PublishOverlay = dynamic(() => import("./publish-overlay").then((m) => m.PublishOverlay), { ssr: false });

export const LoadingMiniGame = dynamic(() => import("@/components/mini-game/loading-mini-game").then((m) => m.LoadingMiniGame), { ssr: false });
