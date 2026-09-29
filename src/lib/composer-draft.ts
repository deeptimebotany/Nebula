// Brouillon du Composer (29/09/2026) : enregistré dans le compte (table
// ComposerDraft, route /api/composer/draft) et gardé en copie dans le
// navigateur. `savedAt` départage les deux copies : la plus récente gagne.
// Sans zod : ce fichier est chargé par le navigateur (Composer, tableau de
// bord) ; le schéma zod du serveur est dans composer-draft-schema.ts.
export interface ComposerDraftData {
  title: string;
  caption: string;
  firstComment?: string;
  selectedNetworks: string[];
  savedAt: number;
}

export const COMPOSER_DRAFT_KEY_PREFIX = "nebula:composer-draft:";

export const COMPOSER_DRAFT_LIMITS = { title: 1000, caption: 70_000, firstComment: 10_000, networks: 20 } as const;

/** Lit un brouillon venu du navigateur ou du serveur ; null si la forme est mauvaise. */
export function normalizeComposerDraft(raw: unknown): ComposerDraftData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : v === undefined ? "" : null);
  const title = str(r.title, COMPOSER_DRAFT_LIMITS.title);
  const caption = str(r.caption, COMPOSER_DRAFT_LIMITS.caption);
  const firstComment = r.firstComment === undefined ? undefined : str(r.firstComment, COMPOSER_DRAFT_LIMITS.firstComment);
  const networks = r.selectedNetworks === undefined ? [] : r.selectedNetworks;
  if (title === null || caption === null || firstComment === null) return null;
  if (!Array.isArray(networks) || networks.length > COMPOSER_DRAFT_LIMITS.networks || !networks.every((n) => typeof n === "string" && n.length <= 30)) return null;
  const savedAt = typeof r.savedAt === "number" && Number.isFinite(r.savedAt) && r.savedAt >= 0 ? Math.floor(r.savedAt) : 0;
  return { title, caption, ...(firstComment !== undefined ? { firstComment } : {}), selectedNetworks: networks as string[], savedAt };
}
