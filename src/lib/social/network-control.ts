// Interrupteurs par réseau et disjoncteur (lot 5, résilience des API).
//
// - Suspension manuelle (page /admin/reseaux) : publication et/ou synchro
//   des statistiques d'un réseau, avec un message pour les utilisateurs.
//   Les publications concernées attendent (statut RETRY_WAIT) et partent
//   toutes seules à la réactivation, au lieu d'échouer.
// - Disjoncteur automatique : BREAKER_THRESHOLD pannes (panne passagère,
//   délai dépassé, limite de débit) en moins de BREAKER_WINDOW_MS chez un
//   même réseau → envois suspendus BREAKER_PAUSE_MS, puis nouvel essai. Le
//   propriétaire est prévenu dans la cloche.
//
// L'état est lu en base au plus toutes les 30 s par instance (cache
// mémoire) : un envoi n'ajoute pas de requête supplémentaire.
import { prisma } from "@/lib/prisma";
import { NETWORKS, type Network } from "@/lib/types";
import { networkLabel } from "@/lib/notifications";
import { alertOwner as alertOwnerRaw, alertOwnerFormatChange } from "@/lib/owner-alerts";
import type { ClassifiedError } from "./errors";

export const BREAKER_THRESHOLD = 5;
export const BREAKER_WINDOW_MS = 10 * 60_000;
export const BREAKER_PAUSE_MS = 15 * 60_000;
/** Une publication suspendue attend au plus 24 h, puis passe en échec. */
export const MAX_PAUSE_WAIT_MS = 24 * 60 * 60_000;
const CACHE_MS = 30_000;

export interface NetworkControlState {
  network: Network;
  publishEnabled: boolean;
  syncEnabled: boolean;
  message: string | null;
  failureCount: number;
  failureWindowStart: Date | null;
  trippedUntil: Date | null;
  lastFailureAt: Date | null;
  lastFailureCategory: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: Date | null;
}

type Row = Omit<NetworkControlState, "network"> & { network: string };

function defaults(network: Network): NetworkControlState {
  return {
    network,
    publishEnabled: true,
    syncEnabled: true,
    message: null,
    failureCount: 0,
    failureWindowStart: null,
    trippedUntil: null,
    lastFailureAt: null,
    lastFailureCategory: null,
    lastFailureMessage: null,
    lastSuccessAt: null
  };
}

let cache: { at: number; rows: Map<string, NetworkControlState> } | null = null;

export function forgetNetworkControlCache(): void {
  cache = null;
}

async function loadAll(): Promise<Map<string, NetworkControlState>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = new Map<string, NetworkControlState>();
  try {
    const list = (await prisma.networkControl.findMany()) as Row[];
    for (const r of list) rows.set(r.network, { ...r, network: r.network as Network });
  } catch (err) {
    // Base indisponible ou table pas encore créée : rien n'est suspendu.
    console.error("[réseaux] lecture des interrupteurs impossible :", (err as Error).message);
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getNetworkControl(network: Network): Promise<NetworkControlState> {
  return (await loadAll()).get(network) ?? defaults(network);
}

/** Tous les réseaux, avec leur état (valeurs par défaut s'il n'y a pas de ligne). */
export async function listNetworkControls(options: { fresh?: boolean } = {}): Promise<NetworkControlState[]> {
  if (options.fresh) forgetNetworkControlCache();
  const rows = await loadAll();
  return NETWORKS.map((n) => rows.get(n) ?? defaults(n));
}

export interface PauseInfo {
  paused: boolean;
  reason: "manual" | "breaker" | null;
  /** Fin prévue de la pause (disjoncteur), null si manuelle. */
  until: Date | null;
  message: string | null;
}

function pauseOf(state: NetworkControlState, enabled: boolean, now: number): PauseInfo {
  if (!enabled) return { paused: true, reason: "manual", until: null, message: state.message };
  if (state.trippedUntil && state.trippedUntil.getTime() > now) {
    return { paused: true, reason: "breaker", until: state.trippedUntil, message: state.message };
  }
  return { paused: false, reason: null, until: null, message: null };
}

export async function publishPause(network: Network, now = Date.now()): Promise<PauseInfo> {
  const state = await getNetworkControl(network);
  return pauseOf(state, state.publishEnabled, now);
}

export async function syncPause(network: Network, now = Date.now()): Promise<PauseInfo> {
  const state = await getNetworkControl(network);
  return pauseOf(state, state.syncEnabled, now);
}

/** Message affiché sur une publication qui attend la fin d'une suspension. */
export function pauseMessage(network: Network, pause: PauseInfo): string {
  const label = networkLabel(network);
  const detail = pause.message ? ` ${pause.message}` : "";
  return pause.reason === "breaker"
    ? `${label} rencontre un incident : envoi suspendu quelques minutes, puis nouvel essai automatique.${detail}`
    : `Publication sur ${label} suspendue temporairement par Nebula : envoi automatique dès la reprise.${detail}`;
}

/**
 * Enregistre une erreur d'un réseau. Seules les pannes (panne passagère,
 * délai dépassé, limite de débit) comptent pour le disjoncteur.
 */
export async function recordProviderFailure(network: Network, classified: ClassifiedError, message: string, now = new Date()): Promise<{ tripped: boolean }> {
  try {
    if (!classified.outage) {
      await prisma.networkControl.upsert({
        where: { network },
        create: { network, lastFailureAt: now, lastFailureCategory: classified.category, lastFailureMessage: message.slice(0, 500) },
        update: { lastFailureAt: now, lastFailureCategory: classified.category, lastFailureMessage: message.slice(0, 500) }
      });
      if (classified.category === "VERSION_SUNSET") await alertOwner(network, "version", message);
      if (classified.category === "UNEXPECTED_RESPONSE") await alertOwner(network, "format", message);
      return { tripped: false };
    }
    const row = (await prisma.networkControl.upsert({ where: { network }, create: { network }, update: {} })) as Row;
    const inWindow = row.failureWindowStart !== null && now.getTime() - row.failureWindowStart.getTime() < BREAKER_WINDOW_MS;
    const failureCount = inWindow ? row.failureCount + 1 : 1;
    const alreadyTripped = row.trippedUntil !== null && row.trippedUntil.getTime() > now.getTime();
    const trip = !alreadyTripped && failureCount >= BREAKER_THRESHOLD;
    await prisma.networkControl.update({
      where: { network },
      data: {
        failureCount: trip ? 0 : failureCount,
        failureWindowStart: trip ? null : inWindow ? row.failureWindowStart : now,
        lastFailureAt: now,
        lastFailureCategory: classified.category,
        lastFailureMessage: message.slice(0, 500),
        ...(trip ? { trippedUntil: new Date(now.getTime() + BREAKER_PAUSE_MS) } : {})
      }
    });
    if (trip) {
      forgetNetworkControlCache();
      console.error(`[disjoncteur] ${network} : ${failureCount} pannes en moins de ${BREAKER_WINDOW_MS / 60_000} min, envois suspendus ${BREAKER_PAUSE_MS / 60_000} min. Dernière erreur : ${message}`);
      await alertOwner(network, "breaker", message);
    }
    return { tripped: trip };
  } catch (err) {
    console.error("[réseaux] enregistrement de l'erreur impossible :", (err as Error).message);
    return { tripped: false };
  }
}

/** Un appel a réussi : remet le compteur de pannes à zéro (sans écriture inutile). */
export async function recordProviderSuccess(network: Network, now = new Date()): Promise<void> {
  try {
    const state = await getNetworkControl(network);
    const lastSuccessOld = !state.lastSuccessAt || now.getTime() - state.lastSuccessAt.getTime() > 60 * 60_000;
    if (state.failureCount === 0 && !state.trippedUntil && !lastSuccessOld) return;
    const expired = state.trippedUntil !== null && state.trippedUntil.getTime() <= now.getTime();
    await prisma.networkControl.upsert({
      where: { network },
      create: { network, lastSuccessAt: now },
      update: { failureCount: 0, failureWindowStart: null, lastSuccessAt: now, ...(expired ? { trippedUntil: null } : {}) }
    });
    if (cache) cache.rows.set(network, { ...state, failureCount: 0, failureWindowStart: null, lastSuccessAt: now, trippedUntil: expired ? null : state.trippedUntil });
  } catch (err) {
    console.error("[réseaux] enregistrement du succès impossible :", (err as Error).message);
  }
}

async function alertOwner(network: Network, kind: "breaker" | "version" | "format", message: string): Promise<void> {
  const label = networkLabel(network);
  if (kind === "format") {
    return alertOwnerFormatChange(label, `network-format:${network}`, message, { href: "/admin/reseaux", actionLabel: "Voir les réseaux" });
  }
  await alertOwnerRaw({
    title: kind === "breaker" ? `Incident ${label} : envois suspendus` : `${label} a changé son API`,
    body:
      kind === "breaker"
        ? `Pannes répétées chez ${label} : les envois sont suspendus ${BREAKER_PAUSE_MS / 60_000} min puis réessayés. Dernière erreur : ${message}`
        : `Version d'API refusée par ${label} : mettez à jour src/lib/social/versions.ts. Erreur : ${message}`,
    href: "/admin/reseaux",
    actionLabel: "Voir les réseaux",
    dedupeKey: `network-${kind}:${network}`
  });
}

export interface NetworkControlPatch {
  publishEnabled?: boolean;
  syncEnabled?: boolean;
  message?: string | null;
  resetBreaker?: boolean;
}

/** Modification depuis /admin/reseaux. */
export async function updateNetworkControl(network: Network, patch: NetworkControlPatch): Promise<NetworkControlState> {
  const data = {
    ...(patch.publishEnabled !== undefined ? { publishEnabled: patch.publishEnabled } : {}),
    ...(patch.syncEnabled !== undefined ? { syncEnabled: patch.syncEnabled } : {}),
    ...(patch.message !== undefined ? { message: patch.message?.trim() ? patch.message.trim().slice(0, 300) : null } : {}),
    ...(patch.resetBreaker ? { trippedUntil: null, failureCount: 0, failureWindowStart: null } : {})
  };
  const row = (await prisma.networkControl.upsert({ where: { network }, create: { network, ...data }, update: data })) as Row;
  forgetNetworkControlCache();
  return { ...row, network };
}

/** Publications en attente d'un réseau réactivé : relancées au prochain passage du cron. */
export async function wakeWaitingTargets(network: Network): Promise<number> {
  const { count } = await prisma.postTarget.updateMany({
    where: { network, status: "RETRY_WAIT", errorCategory: "PAUSED" },
    data: { nextCheckAt: new Date() }
  });
  return count;
}
