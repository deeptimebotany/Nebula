import type { Network } from "./types";

// Liste des fournisseurs OAuth disponibles, partagée entre la page Comptes
// et le raccourci "+" du sélecteur de compte dans la barre de navigation.
export const PROVIDERS: { id: string; label: string; networks: Network[] }[] = [
  { id: "meta", label: "Meta (Instagram + Facebook)", networks: ["INSTAGRAM", "FACEBOOK"] },
  { id: "tiktok", label: "TikTok", networks: ["TIKTOK"] },
  { id: "youtube", label: "YouTube", networks: ["YOUTUBE"] }
];
