// Vocabulaire partagé de la page Engagements (/engagements) — importé par la
// route /api/engagements ET par la page : les cinq métriques suivies, leurs
// libellés, et ce que chaque réseau EXPOSE réellement via son API (voir
// src/lib/social/*.ts → fetchPostMetrics). Ce dernier tableau sert à
// afficher « non fourni par YouTube » plutôt qu'un 0 trompeur.
import type { Network } from "@/lib/types";

export type MetricKey = "views" | "likes" | "comments" | "shares" | "saves";
export const METRIC_KEYS: MetricKey[] = ["views", "likes", "comments", "shares", "saves"];

export const METRIC_LABELS: Record<MetricKey, { label: string; short: string; hint: string }> = {
  views: { label: "Vues", short: "Vues", hint: "Lectures de la vidéo ou affichages de la publication" },
  likes: { label: "J'aime", short: "Likes", hint: "Likes et réactions" },
  comments: { label: "Commentaires", short: "Comm.", hint: "Nombre de commentaires reçus (le texte est dans l'onglet Commentaires)" },
  shares: { label: "Partages", short: "Partages", hint: "Partages, y compris en story quand le réseau les compte" },
  saves: { label: "Enregistrements", short: "Enreg.", hint: "Publications enregistrées / mises en favori" }
};

export const NETWORK_METRIC_SUPPORT: Record<Network, Record<MetricKey, boolean>> = {
  YOUTUBE: { views: true, likes: true, comments: true, shares: false, saves: false },
  INSTAGRAM: { views: true, likes: true, comments: true, shares: true, saves: true },
  FACEBOOK: { views: false, likes: true, comments: true, shares: true, saves: false },
  TIKTOK: { views: true, likes: true, comments: true, shares: true, saves: false },
  // Bluesky : reposts + citations comptés comme partages ; pas de vues publiques.
  BLUESKY: { views: false, likes: true, comments: true, shares: true, saves: false },
  // Threads : vues, j'aime, réponses, reposts + citations.
  THREADS: { views: true, likes: true, comments: true, shares: true, saves: false },
  // Pinterest : impressions (vues), enregistrements, commentaires si exposés.
  PINTEREST: { views: true, likes: false, comments: true, shares: false, saves: true },
  // LinkedIn (profil perso) : pas de statistiques par post dans l'API gratuite.
  LINKEDIN: { views: false, likes: false, comments: false, shares: false, saves: false }
};

/** Format compact « 12,4 k » / « 1,2 M » pour les tuiles et le tableau. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
