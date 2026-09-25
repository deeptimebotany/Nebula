"use client";

// Cache de données partagé entre les pages (lot 6, SWR).
//
// Avant : chaque page (et l'en-tête) refaisait ses propres appels — la liste
// des comptes connectés était demandée par 7 composants différents, souvent
// deux fois pour le même écran, et tout était rechargé à chaque navigation.
// Maintenant, les données communes passent par ce cache :
//  - deux composants qui demandent la même adresse en même temps ne font
//    qu'un appel ;
//  - revenir sur une page affiche immédiatement les données déjà connues,
//    puis les met à jour discrètement (« stale-while-revalidate ») ;
//  - pas de rechargement automatique au simple retour sur l'onglet (chaque
//    appel réveille la base Neon) : seulement à la reconnexion réseau, ou
//    quand une action les modifie (voir data/hooks.ts → refresh*).
import { SWRConfig, useSWRConfig } from "swr";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public info: unknown
  ) {
    super(message);
  }
}

export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : `Erreur ${res.status}`;
    throw new FetchError(message, res.status, data);
  }
  return data as T;
}

export function DataCacheProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: jsonFetcher,
        dedupingInterval: 10_000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        // 401/403/404 : inutile d'insister.
        shouldRetryOnError: (err) => !(err instanceof FetchError && err.status >= 400 && err.status < 500),
        errorRetryCount: 2
      }}
    >
      {children}
    </SWRConfig>
  );
}

// ---------------------------------------------------------------------------
// Données préparées par le serveur (lot 10)
//
// Le layout de l'application et certaines pages (Vue d'ensemble, Analytics)
// calculent côté serveur les données que leurs hooks demanderaient, et les
// passent ici. Effets :
//  - le HTML arrive déjà rempli (plus de squelette puis d'appels en cascade) ;
//  - les hooks ne refont pas l'appel au montage tant que ces données ont
//    moins de SEED_FRESH_MS (voir useSeededMount) ;
//  - elles sont ensuite recopiées dans le cache partagé, pour que les autres
//    pages et les refresh*() (hooks.ts) les trouvent comme si elles venaient
//    d'un appel.
// Une page resservie par le cache du routeur de Next (retour arrière, ou
// lien suivi dans les 30 s) rejoue le MÊME rendu serveur : ses données ne
// comptent alors plus comme fraîches (rechargement discret, comme avant le
// lot 10) et ne remplacent pas le cache, qui peut être plus récent.
// Aucune écriture dans le cache pendant le rendu serveur : le cache de SWR
// y est partagé entre visiteurs ; `fallback` passe par le contexte React.
// ---------------------------------------------------------------------------
export const SEED_FRESH_MS = 20_000;

/**
 * Âge d'une donnée préparée, mesuré de deux façons : `at` (horloge du
 * serveur, au rendu) et `localAt` (horloge du navigateur, à l'affichage).
 * Les deux doivent être récents : `localAt` protège d'un ordinateur dont
 * l'horloge retarde (la donnée paraîtrait sinon « fraîche » indéfiniment).
 */
interface SeedTimes {
  at: number;
  localAt: number;
}
const SeedContext = createContext<ReadonlyMap<string, SeedTimes>>(new Map());

/** Rendus serveur déjà affichés dans cet onglet (voir « rejoue » ci-dessus). */
const shownSeeds = new Set<string>();

export function SeededData({ entries, at, children }: { entries: Record<string, unknown>; at: number; children: ReactNode }) {
  const parent = useContext(SeedContext);
  const id = `${at}:${Object.keys(entries).sort().join(",")}`;
  const [mount] = useState(() => ({ localAt: Date.now(), replay: typeof window !== "undefined" && shownSeeds.has(id) }));
  const seeds = useMemo(() => {
    const next = new Map(parent);
    for (const key of Object.keys(entries)) {
      if (mount.replay) next.delete(key);
      else next.set(key, { at, localAt: mount.localAt });
    }
    return next;
  }, [parent, entries, at, mount]);
  const config = useMemo(() => ({ fallback: entries }), [entries]);
  const { mutate } = useSWRConfig();
  useEffect(() => {
    shownSeeds.add(id);
    if (mount.replay) return;
    for (const [key, data] of Object.entries(entries)) void mutate(key, data, { revalidate: false });
  }, [id, entries, mutate, mount]);
  return (
    <SeedContext.Provider value={seeds}>
      <SWRConfig value={config}>{children}</SWRConfig>
    </SeedContext.Provider>
  );
}

/**
 * Vrai si la donnée `key` vient d'être préparée par le serveur pour CET
 * affichage (ni rejouée, ni âgée de plus de SEED_FRESH_MS). Sert aux pages
 * qui reçoivent aussi des données hors cache (`initial` de la Vue
 * d'ensemble et d'Analytics) : si faux, elles les rechargent.
 */
export function useSeedIsFresh(key: string | null): boolean {
  const seeds = useContext(SeedContext);
  const seed = key ? seeds.get(key) : undefined;
  if (!seed) return false;
  const now = Date.now();
  return now - seed.at <= SEED_FRESH_MS && now - seed.localAt <= SEED_FRESH_MS;
}

/**
 * Option `revalidateOnMount` d'un hook : `false` si la donnée vient d'être
 * préparée par le serveur et que le cache n'en a pas d'autre version ;
 * sinon comportement normal (affichage immédiat puis mise à jour discrète).
 */
export function useSeededMount(key: string | null): boolean | undefined {
  const fresh = useSeedIsFresh(key);
  const { cache, fallback } = useSWRConfig();
  if (!key || !fresh) return undefined;
  // Le cache contient une AUTRE version (chargée avant) : mise à jour normale.
  // S'il contient la donnée du serveur elle-même (recopiée par SeededData,
  // par exemple pour un composant monté après l'hydratation), rien à refaire.
  const cached = typeof window !== "undefined" ? cache.get(key)?.data : undefined;
  if (cached !== undefined && cached !== (fallback as Record<string, unknown> | undefined)?.[key]) return undefined;
  return false;
}
