/**
 * Compte(s) administrateur de la plateforme Nebula — pas un rôle en base,
 * juste une liste d'emails de confiance définie via une variable d'env
 * (même logique que GEMINI_IMAGE_MODEL, etc.) : quiconque figure dans
 * ADMIN_EMAILS peut publier du contenu éditorial (catégorie "Actualités"
 * de la Communauté), créer des sondages, et déclencher la génération du
 * pack d'emojis Premium.
 *
 * Voir .env.example pour la marche à suivre — tant que cette variable est
 * vide, ces actions sont bloquées pour tout le monde (fail-closed).
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Garde « compte propriétaire » pour les routes et pages d'administration
// du brief growth (/admin/acquisition, aperçus d'emails) : même mécanisme
// que le message Stripe de la page Facturation (isOwnerEmail, voir
// src/lib/dev-preview.ts) — distinct des ADMIN_EMAILS ci-dessus (éditorial
// communautaire). Renvoie l'identifiant de l'utilisateur, ou null si ce
// n'est pas le propriétaire — les appelants répondent alors 404.
// ---------------------------------------------------------------------------
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/dev-preview";

export async function requireOwnerUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isOwnerEmail(session.user.email)) return null;
  return (session.user as { id: string }).id;
}
