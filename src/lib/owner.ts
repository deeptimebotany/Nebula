// Compte propriétaire du site (voir dev-preview.ts pour ce qu'il débloque).
// Module sans dépendance (ni next/headers ni base de données) : utilisable
// aussi par le worker et les tâches planifiées, par exemple pour prévenir
// le propriétaire d'un incident chez un réseau (lot 5).
export const OWNER_EMAIL = "nommelucas@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase() === OWNER_EMAIL;
}
