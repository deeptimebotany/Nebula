// Collaborateurs Instagram (01/10/2026) : jusqu'à 3 comptes invités comme
// co-auteurs d'une publication (paramètre `collaborators` de l'API Graph,
// publications du fil, carrousels et Reels ; pas les stories). Chaque compte
// reçoit une invitation ; une fois acceptée, la publication apparaît aussi
// sur son profil. Module pur : utilisé par Publier et par publish.ts.

export const INSTAGRAM_MAX_COLLABORATORS = 3;

/** Nom d'utilisateur Instagram : lettres, chiffres, points et tirets bas, 30 caractères au plus. */
const USERNAME_RE = /^(?!.*\.\.)(?!\.)[a-z0-9._]{1,30}(?<!\.)$/;

/** « @Mon.Compte », un lien instagram.com/mon.compte ou « mon.compte » → « mon.compte » (null si invalide). */
export function normalizeInstagramUsername(raw: string): string | null {
  let v = raw.trim();
  const fromUrl = /instagram\.com\/([^/?#\s]+)/i.exec(v);
  if (fromUrl) v = fromUrl[1];
  v = v.replace(/^@+/, "").toLowerCase();
  return USERNAME_RE.test(v) ? v : null;
}

/** Liste propre (sans doublon, 3 au plus, sans le compte qui publie) depuis une valeur inconnue. */
export function parseInstagramCollaborators(value: unknown, ownUsername?: string | null): string[] {
  if (!Array.isArray(value)) return [];
  const own = ownUsername ? normalizeInstagramUsername(ownUsername) : null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = normalizeInstagramUsername(item);
    if (!name || name === own || out.includes(name)) continue;
    out.push(name);
    if (out.length === INSTAGRAM_MAX_COLLABORATORS) break;
  }
  return out;
}
