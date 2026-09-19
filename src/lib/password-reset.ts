import { randomBytes, createHash } from "crypto";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 heure

/**
 * Génère un jeton de réinitialisation de mot de passe.
 *
 * On ne stocke JAMAIS le jeton en clair en base : seul son hash SHA-256 y
 * est écrit (colonne passwordResetTokenHash). Le jeton en clair part par
 * email et n'existe que dans le lien cliqué par l'utilisateur — même en cas
 * de fuite de la base de données, personne ne peut réinitialiser un mot de
 * passe avec les hashs seuls.
 */
export function generatePasswordResetToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
}

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
