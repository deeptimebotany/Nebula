// Préférences d'affichage côté navigateur (29/09/2026, voir ui-prefs.ts) :
// même usage que localStorage (getPref / setPref, valeurs texte), mais
// enregistrées dans le compte. Le navigateur garde une copie pour
// l'affichage immédiat ; les changements partent au serveur regroupés
// (toutes les 0,8 s au plus). Hors de l'application connectée (aucune
// donnée de compte reçue), on retombe simplement sur le navigateur.
import { isSyncedPrefKey } from "@/lib/ui-prefs";

let cache: Record<string, string> = {};
let seeded = false;
let pending: Record<string, string | null> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function local(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function flush(): void {
  timer = null;
  const changes = pending;
  pending = {};
  if (!Object.keys(changes).length) return;
  void fetch("/api/me/prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
    keepalive: true
  }).catch(() => undefined);
}

function schedule(): void {
  if (!seeded) return;
  if (!timer) timer = setTimeout(flush, 800);
}

/**
 * Données du compte reçues (layout de l'application). Les préférences
 * encore seulement dans ce navigateur (versions précédentes du site) sont
 * envoyées au compte une fois, puis le compte fait foi.
 */
export function seedUiPrefs(fromAccount: Record<string, unknown> | null | undefined): void {
  const store = local();
  cache = {};
  for (const [k, v] of Object.entries(fromAccount ?? {})) if (typeof v === "string") cache[k] = v;
  seeded = true;
  if (!store) return;
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !isSyncedPrefKey(key)) continue;
    const value = store.getItem(key);
    if (value === null) continue;
    if (!(key in cache)) {
      cache[key] = value;
      pending[key] = value;
    }
  }
  // Le navigateur reprend les valeurs du compte (autre appareil).
  for (const [k, v] of Object.entries(cache)) {
    try {
      store.setItem(k, v);
    } catch {
      /* stockage plein ou bloqué */
    }
  }
  schedule();
}

export function getPref(key: string): string | null {
  if (seeded && isSyncedPrefKey(key)) return key in cache ? cache[key] : null;
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string | null): void {
  const store = local();
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch {
    /* stockage indisponible : le compte garde quand même la valeur */
  }
  if (!isSyncedPrefKey(key)) return;
  if (value === null) delete cache[key];
  else cache[key] = value;
  pending[key] = value;
  schedule();
}
