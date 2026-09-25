"use client";

// Provenance du visiteur (?via=<marque>&utm_campaign=<surface>), lue dans le
// navigateur (lot 11) : la page elle-même est pré-générée et servie depuis
// le cache, identique pour tous. Le cookie d'attribution est posé par le
// middleware, avant même l'affichage.
import { useSearchParams } from "next/navigation";
import { TrackView } from "@/components/marketing/track-view";

const SURFACE_LABEL: Record<string, string> = {
  rapport: "un rapport généré",
  calendrier: "un calendrier généré",
  approve: "une page d'approbation générée"
};

function useOrigin() {
  const params = useSearchParams();
  const rawVia = params.get("via") ?? "";
  const rawSurface = params.get("utm_campaign") ?? "";
  return {
    via: /^[\w.-]{1,80}$/.test(rawVia) ? rawVia : "",
    surface: SURFACE_LABEL[rawSurface] ? rawSurface : "rapport"
  };
}

/** « un rapport généré », « un calendrier généré »… selon la page d'où vient le visiteur. */
export function OriginLabel() {
  return <>{SURFACE_LABEL[useOrigin().surface]}</>;
}

/** Mesure de la visite, avec sa provenance. */
export function OriginTracker() {
  const { via, surface } = useOrigin();
  return <TrackView name="landing_view" meta={{ landing: "rapports-clients", via, surface }} />;
}
