// Textes de l'essai partagés entre le serveur et l'interface (lots E1, E3),
// sans dépendance serveur : importables depuis un composant client.
import { PLAN_LIMITS } from "@/lib/plans";

/** Page Facturation, compte créé sans essai (anti-abus, lot E3). */
export const TRIAL_DENIED_MESSAGE = "Votre essai n'a pas pu démarrer : un essai a déjà été utilisé avec cette adresse ou récemment depuis ce réseau.";

/** Note affichée pendant l'essai à la création d'une marque ou d'un compte au-delà du Gratuit (lot E4). */
export function trialBeyondFreeNote(trialEndsAt: string | Date | null | undefined, what: "brand" | "connection"): string {
  const date = trialEndsAt ? new Date(trialEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "la fin de l'essai";
  return what === "brand"
    ? `Pendant l'essai. Après le ${date}, en Gratuit, une seule marque reste active ; les autres sont mises en veille, rien n'est supprimé.`
    : // Comptes en trop (09/10/2026) : à déconnecter pour continuer, voir src/lib/billing/connection-limit.ts.
      `Pendant l'essai. Après le ${date}, en Gratuit, ${PLAN_LIMITS.FREE.maxConnections} comptes par marque : il faudra déconnecter les autres pour continuer à utiliser Nebula, ou passer en Pro. Choisissez dès maintenant ceux que vous gardez.`;
}
