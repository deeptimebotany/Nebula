// Conseils affichés sous une erreur de publication (lot 5), selon sa
// catégorie (voir errors.ts). Module sans dépendance : utilisable dans les
// pages (navigateur) comme sur le serveur.

/** Conseil affiché à l'utilisateur sous le message du réseau. */
export function errorAdvice(category: string | null | undefined, networkLabel: string): string | null {
  switch (category) {
    case "AUTH_EXPIRED":
      return `La connexion à ${networkLabel} a expiré ou a été retirée : reconnectez le compte dans Comptes, puis relancez.`;
    case "PERMISSION_MISSING":
      return `${networkLabel} refuse cette action avec les autorisations actuelles : reconnectez le compte en acceptant toutes les autorisations demandées.`;
    case "RATE_LIMITED":
      return `${networkLabel} limite temporairement le nombre d'envois : relancez un peu plus tard.`;
    case "QUOTA_EXHAUSTED":
      return `La limite quotidienne de ${networkLabel} est atteinte : relancez demain.`;
    case "INVALID_MEDIA":
      return `${networkLabel} refuse ce média (format, durée, taille ou dimensions) : vérifiez ses exigences, remplacez le fichier puis relancez.`;
    case "INVALID_REQUEST":
      return `${networkLabel} refuse le contenu tel quel : corrigez-le d'après le message ci-dessus, puis relancez.`;
    case "VERSION_SUNSET":
      return `${networkLabel} a changé son API : l'équipe Nebula est prévenue et corrige au plus vite.`;
    case "TRANSIENT":
      return `Incident passager chez ${networkLabel} : relancez dans quelques minutes.`;
    case "TIMEOUT":
      return `${networkLabel} n'a pas confirmé l'envoi à temps. En relançant, Nebula vérifie d'abord que la publication n'est pas déjà en ligne ; en cas de doute, regardez sur ${networkLabel}.`;
    case "UNEXPECTED_RESPONSE":
      return `${networkLabel} a répondu dans un format que Nebula ne reconnaît pas (changement de son API) : l'équipe Nebula est prévenue. En relançant, Nebula vérifie d'abord que la publication n'est pas déjà en ligne ; en cas de doute, regardez sur ${networkLabel}.`;
    case "INTERRUPTED":
      return `L'envoi a été interrompu. En relançant, Nebula vérifie d'abord que la publication n'est pas déjà en ligne sur ${networkLabel}.`;
    case "PAUSED":
      return `La publication sur ${networkLabel} était suspendue par Nebula : relancez-la maintenant que le réseau est rétabli.`;
    default:
      return null;
  }
}
