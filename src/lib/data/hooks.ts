"use client";

// Données communes à plusieurs pages, servies par le cache partagé (voir
// swr-config.tsx). Une adresse = une entrée de cache : tous les composants
// qui utilisent le même hook avec la même marque partagent le résultat.
import useSWR, { mutate } from "swr";
import { jsonFetcher, useSeededMount } from "./swr-config";

import { aiStatusKey, analyticsKey, connectionsKey } from "./keys";

export { aiStatusKey, analyticsKey, connectionsKey };

/** Comptes connectés d'une marque (en-tête, Vue d'ensemble, Publier, Comptes…). */
export function useConnections<T>(brandId: string | null | undefined) {
  const key = brandId ? connectionsKey(brandId) : null;
  const revalidateOnMount = useSeededMount(key);
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ connections: T[] }>(key, jsonFetcher, { revalidateOnMount });
  return { connections: data?.connections ?? null, error: error as Error | undefined, isLoading: Boolean(brandId) && isLoading, revalidate };
}

/** À appeler après une connexion, déconnexion ou synchro : toutes les vues se mettent à jour. */
export function refreshConnections(brandId?: string) {
  const prefix = brandId ? connectionsKey(brandId) : "/api/connections?";
  return mutate((key) => typeof key === "string" && key.startsWith(prefix));
}

export interface AiStatus {
  enabled: boolean;
  keyConfigured: boolean;
  plan: string;
  planAllowsAi: boolean;
}

const AI_OFF: AiStatus = { enabled: false, keyConfigured: false, plan: "FREE", planAllowsAi: false };

/** IA disponible pour la marque (clé Gemini configurée ET palier Pro/Agence). */
export function useAiStatusData(brandId: string | null | undefined): AiStatus | null {
  const key = brandId ? aiStatusKey(brandId) : null;
  const revalidateOnMount = useSeededMount(key);
  const { data, error } = useSWR<AiStatus>(key, jsonFetcher, { dedupingInterval: 60_000, revalidateOnMount });
  if (error) return AI_OFF;
  return data ?? null;
}

/** Usage du mois et limites du palier (barre de quota, Facturation). */
export function useUsage<T>(brandId: string | null | undefined) {
  const { data, error, isLoading, mutate: revalidate } = useSWR<T>(brandId ? `/api/billing/usage?brandId=${brandId}` : null, jsonFetcher);
  return { usage: data ?? null, error: error as Error | undefined, isLoading: Boolean(brandId) && isLoading, revalidate };
}

export function refreshUsage() {
  return mutate((key) => typeof key === "string" && key.startsWith("/api/billing/usage"));
}

/** Instantanés de statistiques par compte (Vue d'ensemble, Analytics). */
export function useAnalytics<T>(brandId: string | null | undefined) {
  const key = brandId ? analyticsKey(brandId) : null;
  const revalidateOnMount = useSeededMount(key);
  const { data, error, isLoading, mutate: revalidate } = useSWR<{ connections: T[] }>(key, jsonFetcher, { revalidateOnMount });
  return { connections: data?.connections ?? null, error: error as Error | undefined, isLoading: Boolean(brandId) && isLoading, revalidate };
}

export function refreshAnalytics() {
  return mutate((key) => typeof key === "string" && key.startsWith("/api/analytics?"));
}
