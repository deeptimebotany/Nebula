// Redirections internes sûres (audit sécurité, lot 1).
//
// Un paramètre du type ?next=, ?returnTo= ou ?callbackUrl= ne doit JAMAIS
// pouvoir envoyer l'utilisateur vers un autre site : « //evil.com » ou
// « /\evil.com » (que les navigateurs lisent comme //evil.com) passaient
// les anciennes vérifications. On n'accepte qu'un chemin du site, résolu
// contre une origine fictive puis relu : s'il change d'origine, il est
// remplacé par la valeur de repli.
const BASE = "https://nebula.invalid";

export function safeRelativePath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Barre oblique inverse et caractères de contrôle : refusés d'emblée.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
