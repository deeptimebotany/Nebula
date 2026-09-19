import type { Network } from "./types";

// Liste des fournisseurs OAuth disponibles, partagée entre la page Comptes
// et le raccourci "+" du sélecteur de compte dans la barre de navigation.
// Facebook et Instagram étaient auparavant regroupés sous un seul
// fournisseur "Meta" (une seule autorisation connectait les deux à la fois).
// Ils sont désormais séparés : chacun a son propre bouton "Connecter", pour
// qu'une personne qui ne gère qu'un des deux réseaux n'ait pas à passer par
// l'autre. Les deux passent toujours par la même boîte de dialogue OAuth de
// Meta (Facebook n'offre pas de connexion Instagram-seule côté plateforme),
// mais /api/connections/[provider]/callback ne crée ensuite que les comptes
// du réseau demandé — voir ce fichier pour le détail.
export const PROVIDERS: { id: string; label: string; networks: Network[] }[] = [
  { id: "facebook", label: "Facebook", networks: ["FACEBOOK"] },
  { id: "instagram", label: "Instagram", networks: ["INSTAGRAM"] },
  { id: "tiktok", label: "TikTok", networks: ["TIKTOK"] },
  { id: "youtube", label: "YouTube", networks: ["YOUTUBE"] }
];
