// Préférences d'affichage suivies d'un appareil à l'autre (29/09/2026,
// demande de Lucas : « ce qui est enregistré sur le PC » passe dans le
// compte). Ce que l'application gardait seulement dans le navigateur
// (localStorage) est désormais enregistré dans User.uiPrefs ; le navigateur
// ne sert plus que de cache (voir ui-prefs-client.ts).
//
// Liste FERMÉE de clés (mêmes noms qu'avant dans le navigateur) : le serveur
// refuse toute autre clé. Valeurs : texte court, comme localStorage.
// Restent dans le navigateur seulement : ce qui n'appartient à aucun compte
// (visiteurs : page d'approbation, outils, fenêtre de sortie), les repères
// d'une journée (easter eggs) et le thème / mode / fond, déjà enregistrés
// dans le compte par leurs propres réglages.

export const UI_PREF_KEYS = [
  "nebula:calendar-view",
  "nebula:sidebar-collapsed",
  "nebula:notifications-seen-at",
  "nebula:composer-preview-device",
  "nebula:composer-preview-network",
  "nebula:achievement-sound",
  "nebula:reussites-succes-collapsed",
  "nebula:theme-nova-unlocked",
  "nebula:minigame-best",
  // Refonte V2 (07/10/2026) : catégories dépliées du menu (plus lues depuis le
  // menu sans catégories du 10/10/2026, clé gardée pour les onglets encore
  // ouverts), aperçu de Publier rangé.
  "nebula:nav-groups-open",
  "nebula:composer-preview-hidden"
] as const;

/** Clés suivies d'un identifiant (marque, compte connecté). */
export const UI_PREF_PREFIXES = ["nebula:utm-recent:", "nebula:onboarding-dismissed:", "nebula:supernova-impressions:", "nebula:milestone-followers-"] as const;

export const UI_PREF_MAX_VALUE = 2000;
export const UI_PREF_MAX_KEYS = 300;
export const UI_PREF_MAX_BYTES = 24_000;

export function isSyncedPrefKey(key: string): boolean {
  if ((UI_PREF_KEYS as readonly string[]).includes(key)) return true;
  return key.length <= 120 && UI_PREF_PREFIXES.some((p) => key.startsWith(p) && /^[A-Za-z0-9:_-]+$/.test(key.slice(p.length)));
}

/** Ne garde que les clés autorisées et les valeurs texte bornées. */
export function sanitizeUiPrefs(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= UI_PREF_MAX_KEYS) break;
    if (!isSyncedPrefKey(k) || typeof v !== "string" || v.length > UI_PREF_MAX_VALUE) continue;
    out[k] = v;
    n += 1;
  }
  return out;
}

/** Applique des changements (null = supprimer) ; refuse si le total dépasse la limite. */
export function mergeUiPrefs(current: Record<string, string>, changes: Record<string, string | null>): { ok: true; prefs: Record<string, string> } | { ok: false; error: string } {
  const next = { ...current };
  for (const [k, v] of Object.entries(changes)) {
    if (!isSyncedPrefKey(k)) return { ok: false, error: `Préférence inconnue : ${k}` };
    if (v === null) delete next[k];
    else if (typeof v !== "string" || v.length > UI_PREF_MAX_VALUE) return { ok: false, error: `Valeur invalide : ${k}` };
    else next[k] = v;
  }
  if (Object.keys(next).length > UI_PREF_MAX_KEYS || JSON.stringify(next).length > UI_PREF_MAX_BYTES) return { ok: false, error: "Trop de préférences enregistrées." };
  return { ok: true, prefs: next };
}
