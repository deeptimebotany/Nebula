// Liens saisis par les utilisateurs (Page bio…) — audit sécurité, lot 1.
//
// Le validateur .url() de zod accepte « javascript:… » et « data:… » : un tel
// lien, placé dans la Page bio publique, exécutait du code chez le visiteur
// qui cliquait (bloqué aujourd'hui par la CSP, mais la CSP ne doit pas être
// la seule barrière). On n'accepte que les protocoles utiles à un lien.
const ALLOWED_PROTOCOLS = new Set(["https:", "http:", "mailto:", "tel:"]);

export function isSafeLinkUrl(value: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** À utiliser au rendu : un lien non sûr devient inactif. */
export function safeHref(value: string | null | undefined): string {
  return value && isSafeLinkUrl(value) ? value : "#";
}
