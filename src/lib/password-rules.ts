// Règles communes des mots de passe (29/09/2026) : inscription,
// réinitialisation et Paramètres → Compte. bcrypt n'utilise que les 72
// premiers octets d'un mot de passe : au-delà, on refuse plutôt que de
// tronquer en silence (deux mots de passe différents seraient acceptés).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export function passwordTooLong(password: string): boolean {
  return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES;
}
