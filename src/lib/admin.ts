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
