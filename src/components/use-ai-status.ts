"use client";

// Sait si les fonctions IA doivent être affichées pour cette marque (clé
// Gemini configurée par l'hébergeur ET palier Pro/Agence actif). Depuis le
// lot 6, le résultat est partagé par tous les composants (cache SWR, voir
// src/lib/data/hooks.ts) : un seul appel au lieu d'un par composant.
export { useAiStatusData as useAiStatus } from "@/lib/data/hooks";
