// Refus de TikTok en clair (06/10/2026). TikTok répond en anglais
// (« The daily quota for active publishing users from your client is
// reached. ») : ce texte s'affichait tel quel sous une publication échouée.
// Les refus qui concernent la personne qui publie ont ici un message
// français qui dit ce qui se passe et quoi faire. Module sans dépendance :
// utilisé par le client TikTok (publication) et par la section TikTok de
// Publier (/api/social/tiktok/creator-info).

/** Plafond de TikTok : trop de comptes différents ont publié via Nebula sur 24 h. */
export const TIKTOK_ACTIVE_USER_CAP = "reached_active_user_cap";

export const TIKTOK_ERROR_MESSAGES: Record<string, string> = {
  [TIKTOK_ACTIVE_USER_CAP]:
    "TikTok limite chaque jour le nombre de comptes qui peuvent publier depuis Nebula, et cette limite est atteinte pour aujourd'hui. Votre vidéo n'a pas été publiée, mais rien n'est perdu : relancez-la demain depuis Nebula, ou publiez-la directement dans l'application TikTok. L'équipe Nebula est prévenue.",
  spam_risk_too_many_posts: "Ce compte TikTok a atteint le nombre de publications par jour autorisé par TikTok. Relancez la publication demain.",
  spam_risk_too_many_pending_share: "Plusieurs vidéos de ce compte attendent encore d'être traitées par TikTok : attendez qu'elles soient publiées, puis relancez.",
  spam_risk_user_banned_from_posting: "TikTok n'autorise plus ce compte à publier pour le moment. Vérifiez les notifications de votre compte dans l'application TikTok.",
  unaudited_client_can_only_post_to_private_accounts:
    "Pour l'instant, TikTok n'accepte les publications envoyées par Nebula que sur des comptes privés : passez votre compte en privé dans l'application TikTok (Paramètres et confidentialité), puis relancez."
};

/** Message à montrer pour un code d'erreur TikTok, ou `fallback` s'il n'est pas connu. */
export function tiktokErrorMessage(code: string | null | undefined, fallback: string): string {
  return (code && Object.prototype.hasOwnProperty.call(TIKTOK_ERROR_MESSAGES, code) && TIKTOK_ERROR_MESSAGES[code]) || fallback;
}
