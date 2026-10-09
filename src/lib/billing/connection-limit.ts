// Limite de comptes connectés par marque (09/10/2026, demande de Lucas).
//
// Avant : à la fin de l'essai (ou après une résiliation), les comptes en trop
// étaient mis « en veille » par le cron (applyFreeLimits) — sur le site de
// test, sans cron, jamais ; et en production, pas avant le passage suivant.
// Entre-temps, les 6 comptes d'un ancien essai restaient utilisables.
//
// Maintenant, la règle est vérifiée À CHAQUE FOIS, d'après le palier du
// propriétaire de la marque au moment même (essai fini = Gratuit) :
//   - au-delà des comptes du palier, l'application est bloquée par la
//     fenêtre « Trop de comptes connectés » (connection-limit-gate.tsx) tant
//     que la personne n'a pas déconnecté les comptes en trop — ou payé ;
//   - côté serveur, la marque ne publie plus rien (assertBrandWritable) ;
//   - un NOUVEAU compte n'est accepté que s'il tient dans le palier
//     (assertConnectionAllowed) ; reconnecter un compte déjà relié reste
//     possible même à la limite ;
//   - dès que la marque repasse dans la limite, ses comptes mis en veille
//     par le cron sont réveillés (wakeConnectionsWithinLimit).
// Un compte connecté = un compte, Instagram et Facebook compris (connectionSlotsFor).
import { prisma } from "@/lib/prisma";
import { connectionSlotsFor } from "@/lib/connection-slots";
import { countConnectionSlots, getBrandPlan } from "@/lib/billing/plan";
import { ACTIVITY_WINDOW_DAYS, pickConnectionsToKeep } from "@/lib/billing/free-limits";

/** Raison renvoyée par l'API quand une marque dépasse ses comptes. */
export const CONNECTION_LIMIT_REASON = "connection_limit" as const;

const DAY = 86_400_000;

export interface ConnectionOverage {
  slots: number;
  max: number;
  planLabel: string;
  over: boolean;
}

export interface LimitConnection {
  id: string;
  network: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  status: string;
  dormant: boolean;
}

export interface ConnectionLimitState extends ConnectionOverage {
  brandId: string;
  connections: LimitConnection[];
  /** Comptes à garder proposés par défaut (les choisis, sinon les plus utilisés). */
  suggestedKeep: string[];
}

/** Texte commun (fenêtre, refus de l'API). */
export function connectionLimitMessage(slots: number, max: number, planLabel: string): string {
  return `Cette marque a ${slots} comptes connectés, mais votre palier ${planLabel} en permet ${max}. Déconnectez les comptes en trop pour continuer, ou passez à un palier supérieur.`;
}

export function connectionLimitReachedMessage(planLabel: string, max: number): string {
  return `Limite de comptes connectés atteinte pour le palier ${planLabel} (${max} comptes par marque). Passez sur un palier supérieur dans Facturation pour en connecter un autre.`;
}

/** La marque dépasse-t-elle les comptes de son palier, maintenant ? */
export async function brandConnectionOverage(brandId: string): Promise<ConnectionOverage> {
  const [{ limits }, slots] = await Promise.all([getBrandPlan(brandId), countConnectionSlots(brandId)]);
  return { slots, max: limits.maxConnections, planLabel: limits.label, over: slots > limits.maxConnections };
}

/** Tout ce que la fenêtre « Trop de comptes connectés » affiche. */
export async function connectionLimitState(brandId: string, now: Date = new Date()): Promise<ConnectionLimitState> {
  const overage = await brandConnectionOverage(brandId);
  const rows = await prisma.socialConnection.findMany({
    where: { brandId, status: { not: "DISCONNECTED" } },
    select: { id: true, network: true, displayName: true, handle: true, avatarUrl: true, status: true, dormantAt: true, connectedAt: true },
    orderBy: { connectedAt: "asc" }
  });
  const connections: LimitConnection[] = rows.map((c) => ({
    id: c.id,
    network: c.network,
    displayName: c.displayName,
    handle: c.handle,
    avatarUrl: c.avatarUrl,
    status: c.status,
    dormant: Boolean(c.dormantAt)
  }));
  if (!overage.over || rows.length === 0) return { ...overage, brandId, connections, suggestedKeep: rows.map((c) => c.id) };

  // Proposition par défaut : les comptes choisis dans « Choisir ce que je
  // garde » (marque active), sinon ceux qui ne sont pas en veille, puis les
  // plus utilisés sur 14 jours.
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY);
  const [uses, owner] = await Promise.all([
    prisma.postTarget.groupBy({ by: ["connectionId"], where: { connectionId: { in: rows.map((c) => c.id) }, post: { createdAt: { gte: since } } }, _count: { _all: true } }),
    prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" }, select: { user: { select: { freeActiveBrandId: true, freeActiveConnectionIds: true } } } })
  ]);
  const chosenRaw = owner?.user?.freeActiveBrandId === brandId ? owner.user.freeActiveConnectionIds : null;
  const chosen = Array.isArray(chosenRaw) ? chosenRaw.filter((v): v is string => typeof v === "string") : [];
  const preferred = chosen.length ? chosen : rows.filter((c) => !c.dormantAt).map((c) => c.id);
  const candidates = rows.map((c) => ({ id: c.id, network: c.network, createdAt: c.connectedAt, uses: uses.find((u) => u.connectionId === c.id)?._count._all ?? 0 }));
  const keep = pickConnectionsToKeep(candidates, overage.max, preferred);
  return { ...overage, brandId, connections, suggestedKeep: rows.map((c) => c.id).filter((id) => keep.has(id)) };
}

/**
 * Un compte peut-il être relié à cette marque ? Reconnecter un compte déjà
 * relié (même réseau, même identifiant, pas déconnecté) : toujours. Un
 * nouveau compte : seulement s'il tient dans le palier. Lève une erreur au
 * message prêt à afficher sinon.
 */
export async function assertConnectionAllowed(brandId: string, network: string, externalAccountId: string): Promise<void> {
  const existing = await prisma.socialConnection.findFirst({ where: { brandId, network, externalAccountId }, select: { status: true } });
  if (existing && existing.status !== "DISCONNECTED") return;
  const [{ limits }, current] = await Promise.all([
    getBrandPlan(brandId),
    prisma.socialConnection.findMany({ where: { brandId, status: { not: "DISCONNECTED" } }, select: { network: true } })
  ]);
  if (connectionSlotsFor([...current.map((c) => c.network), network]) > limits.maxConnections) {
    throw new Error(connectionLimitReachedMessage(limits.label, limits.maxConnections));
  }
}

/** Marque revenue dans sa limite : ses comptes mis en veille par le cron publient de nouveau. */
export async function wakeConnectionsWithinLimit(brandId: string): Promise<number> {
  const overage = await brandConnectionOverage(brandId);
  if (overage.over) return 0;
  const { count } = await prisma.socialConnection.updateMany({
    where: { brandId, status: { not: "DISCONNECTED" }, dormantAt: { not: null } },
    data: { dormantAt: null }
  });
  return count;
}
