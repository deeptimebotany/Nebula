// Fin d'essai propre (lot E4, brief « Essai 14 jours », 29/09/2026).
//
// UNE fonction pour toutes les descentes en Gratuit : applyFreeLimits(userId,
// reason) — fin d'essai (cron), résiliation, pause, impayé (webhook Stripe),
// échange de marque active. Rien n'est jamais supprimé :
//   - une marque reste active (choisie par l'utilisateur, sinon la plus
//     utilisée sur 14 jours, à égalité la plus ancienne) ; les autres passent
//     « en veille » (Brand.dormantAt) : tout reste visible, rien ne se publie
//     ni ne se synchronise, les jetons restent en base sans être rafraîchis ;
//   - sur la marque active, au-delà des comptes du Gratuit, même principe par
//     compte connecté (SocialConnection.dormantAt), au choix de l'utilisateur ;
//   - publications programmées en veille : celles qui partent dans les 7 jours
//     sont publiées, les suivantes repassent en brouillon avec leur date
//     d'origine gardée (Post.dormantScheduledAt) ;
//   - liens de page bio au-delà du Gratuit désactivés (page toujours en ligne,
//     version Gratuit) ; rapports, calendrier client et media kit dépubliés.
// Idempotente : relancée, elle ne change rien de plus.
//
// Et le chemin inverse, reactivateAfterUpgrade(userId) (webhook Stripe,
// cron) : marques et comptes réactivés dans la limite du nouveau palier ;
// rescheduleDormantPosts() remet les brouillons à leur date d'origine si elle
// est encore à venir (bouton « Reprogrammer les n publications »).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plans";
import { connectionSlotsFor, getUserPlan } from "@/lib/billing/plan";
import { invalidateLinkPage } from "@/lib/link-in-bio-cache";
import { mediaKitDb } from "@/lib/media-kit/load";
import { invalidateMediaKit } from "@/lib/media-kit/cache";
import { notifyOnce } from "@/lib/notifications";

/** Changer de marque active en Gratuit : une fois tous les 30 jours. */
export const ACTIVE_BRAND_CHANGE_DAYS = 30;
/** Publications d'une marque mise en veille encore honorées pendant 7 jours. */
export const DORMANT_PUBLISH_GRACE_DAYS = 7;
/** Fenêtre d'activité pour le choix par défaut de la marque active. */
export const ACTIVITY_WINDOW_DAYS = 14;

/** founder_end : fin de l'année « Fondateur Premium » (ou remboursement), voir founders.ts. */
export type FreeLimitsReason = "trial_end" | "cancel" | "pause" | "unpaid" | "swap" | "founder_end";

const DAY = 86_400_000;
const ACTIVE_POST_STATUSES = ["PUBLISHED", "PARTIAL", "SCHEDULED", "PUBLISHING"];

export const DORMANT_BRAND_MESSAGE =
  "Cette marque est en veille en Gratuit : tout est conservé, mais elle ne publie plus. Passez en Pro pour la réactiver, ou faites-en votre marque active.";
export const DORMANT_CONNECTION_MESSAGE =
  "Un des comptes choisis est en veille : en Gratuit, seuls les comptes gardés sur votre marque active publient. Passez en Pro pour le réactiver.";

// --- Choix par défaut (fonctions pures, testées) ---------------------------------

export interface UsageCandidate {
  id: string;
  createdAt: Date;
  /** Publications publiées ou programmées sur 14 jours (marque), cibles (compte). */
  uses: number;
}

/** Tri « la plus utilisée d'abord, à égalité la plus ancienne ». */
export function sortByUsage<T extends UsageCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => b.uses - a.uses || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

/** Marque active par défaut : la plus utilisée sur 14 jours, à égalité la plus ancienne. */
export function pickDefaultActiveBrand<T extends UsageCandidate>(brands: T[]): T | null {
  return sortByUsage(brands)[0] ?? null;
}

/**
 * Comptes gardés dans la limite du Gratuit : d'abord ceux choisis par
 * l'utilisateur (dans son ordre), puis les plus utilisés (un compte connecté
 * = un compte, connectionSlotsFor).
 */
export function pickConnectionsToKeep<T extends UsageCandidate & { network: string }>(connections: T[], limit: number, chosen: string[] | null): Set<string> {
  const byId = new Map(connections.map((c) => [c.id, c]));
  const ordered = [...(chosen ?? []).map((id) => byId.get(id)).filter((c): c is T => Boolean(c)), ...sortByUsage(connections)];
  const keep: T[] = [];
  for (const c of ordered) {
    if (keep.some((k) => k.id === c.id)) continue;
    if (connectionSlotsFor([...keep, c].map((k) => k.network)) <= limit) keep.push(c);
  }
  return new Set(keep.map((k) => k.id));
}

// --- Lectures ----------------------------------------------------------------------

export interface BrandActivity {
  id: string;
  name: string;
  createdAt: Date;
  dormantAt: Date | null;
  uses: number;
  connections: { id: string; network: string; displayName: string; status: string; dormantAt: Date | null; uses: number; createdAt: Date }[];
  scheduledPosts: number;
  lastActivityAt: Date | null;
}

/** Marques possédées par le compte, avec leur activité (écran « Choisir ce que je garde »). */
export async function brandActivity(userId: string, now: Date = new Date()): Promise<BrandActivity[]> {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY);
  const brands = await prisma.brand.findMany({
    where: { memberships: { some: { userId, role: "OWNER" } } },
    select: {
      id: true,
      name: true,
      createdAt: true,
      dormantAt: true,
      connections: { where: { status: { not: "DISCONNECTED" } }, select: { id: true, network: true, displayName: true, status: true, dormantAt: true, connectedAt: true }, orderBy: { connectedAt: "asc" } }
    },
    orderBy: { createdAt: "asc" }
  });
  if (brands.length === 0) return [];
  const brandIds = brands.map((b) => b.id);
  const recentWhere = { brandId: { in: brandIds }, status: { in: ACTIVE_POST_STATUSES }, OR: [{ createdAt: { gte: since } }, { scheduledAt: { gte: since } }] };
  const [recent, scheduled, last, targetUses] = await Promise.all([
    prisma.post.groupBy({ by: ["brandId"], where: recentWhere, _count: { _all: true } }),
    prisma.post.groupBy({ by: ["brandId"], where: { brandId: { in: brandIds }, status: "SCHEDULED" }, _count: { _all: true } }),
    prisma.post.groupBy({ by: ["brandId"], where: { brandId: { in: brandIds } }, _max: { updatedAt: true } }),
    prisma.postTarget.groupBy({ by: ["connectionId"], where: { post: recentWhere }, _count: { _all: true } })
  ]);
  const count = (rows: { brandId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.brandId === id)?._count._all ?? 0;
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    dormantAt: b.dormantAt,
    uses: count(recent, b.id),
    scheduledPosts: count(scheduled, b.id),
    lastActivityAt: last.find((r) => r.brandId === b.id)?._max.updatedAt ?? null,
    connections: b.connections.map((c) => ({
      id: c.id,
      network: c.network,
      displayName: c.displayName,
      status: c.status,
      dormantAt: c.dormantAt,
      createdAt: c.connectedAt,
      uses: targetUses.find((t) => t.connectionId === c.id)?._count._all ?? 0
    }))
  }));
}

/** Marque qui reste active en Gratuit : le choix enregistré, sinon la plus utilisée. */
export function resolveActiveBrand(brands: BrandActivity[], chosenId: string | null | undefined): BrandActivity | null {
  return brands.find((b) => b.id === chosenId) ?? pickDefaultActiveBrand(brands);
}

function chosenConnectionIds(value: unknown): string[] | null {
  const ids = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return ids.length ? ids : null;
}

// --- Brouillons ----------------------------------------------------------------------

/**
 * Publications programmées au-delà de `graceEnd` sur une marque en veille (ou
 * visant un compte en veille) : repassent en brouillon, date d'origine gardée
 * dans dormantScheduledAt. Mise à jour conditionnelle ligne par ligne (statut
 * encore « programmée ») : un envoi qui démarre entre-temps n'est pas touché.
 */
async function draftFarPosts(brandIds: string[], connectionIds: string[], graceEnd: Date): Promise<number> {
  if (brandIds.length === 0 && connectionIds.length === 0) return 0;
  const or: Prisma.PostWhereInput[] = [];
  if (brandIds.length) or.push({ brandId: { in: brandIds } });
  if (connectionIds.length) or.push({ targets: { some: { connectionId: { in: connectionIds } } } });
  const posts = await prisma.post.findMany({ where: { status: "SCHEDULED", scheduledAt: { gt: graceEnd }, OR: or }, select: { id: true, scheduledAt: true } });
  let drafted = 0;
  for (const post of posts) {
    const { count } = await prisma.post.updateMany({
      where: { id: post.id, status: "SCHEDULED" },
      data: { status: "DRAFT", dormantScheduledAt: post.scheduledAt, scheduledAt: null }
    });
    if (count === 0) continue;
    await prisma.postTarget.updateMany({ where: { postId: post.id, status: "SCHEDULED" }, data: { status: "PENDING" } });
    drafted += 1;
  }
  return drafted;
}

// --- Descente en Gratuit ------------------------------------------------------------

export interface FreeLimitsResult {
  applied: boolean;
  activeBrandId: string | null;
  dormantBrands: number;
  dormantConnections: number;
  drafted: number;
  graceEnd: Date | null;
}

const NOOP: FreeLimitsResult = { applied: false, activeBrandId: null, dormantBrands: 0, dormantConnections: 0, drafted: 0, graceEnd: null };

export async function applyFreeLimits(userId: string, reason: FreeLimitsReason, now: Date = new Date()): Promise<FreeLimitsResult> {
  const info = await getUserPlan(userId);
  // Payant, accès offert ou essai en cours : rien à appliquer.
  if (info.paid || info.comp || info.onTrial) return NOOP;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { freeActiveBrandId: true, freeActiveConnectionIds: true, trialEndsAt: true } });
  if (!user) return NOOP;

  const brands = await brandActivity(userId, now);
  const free = PLAN_LIMITS.FREE;
  const active = resolveActiveBrand(brands, user.freeActiveBrandId);
  // Marques gardées : l'active, puis (si le palier en permet plusieurs) les plus utilisées.
  const keep = new Set<string>();
  if (active) keep.add(active.id);
  for (const b of sortByUsage(brands)) if (keep.size < info.maxBrands) keep.add(b.id);

  const toSleep = brands.filter((b) => !keep.has(b.id) && !b.dormantAt).map((b) => b.id);
  const toWake = brands.filter((b) => keep.has(b.id) && b.dormantAt).map((b) => b.id);
  if (toSleep.length) await prisma.brand.updateMany({ where: { id: { in: toSleep }, dormantAt: null }, data: { dormantAt: now } });
  if (toWake.length) await prisma.brand.updateMany({ where: { id: { in: toWake } }, data: { dormantAt: null } });
  if (active && user.freeActiveBrandId !== active.id) await prisma.user.update({ where: { id: userId }, data: { freeActiveBrandId: active.id } });

  // Comptes connectés des marques gardées : au plus maxConnections (Gratuit).
  let dormantConnections = 0;
  const sleepingConnectionIds: string[] = [];
  for (const b of brands.filter((x) => keep.has(x.id))) {
    const keepConn = pickConnectionsToKeep(b.connections, free.maxConnections, b.id === active?.id ? chosenConnectionIds(user.freeActiveConnectionIds) : null);
    const sleep = b.connections.filter((c) => !keepConn.has(c.id));
    const newlySleeping = sleep.filter((c) => !c.dormantAt).map((c) => c.id);
    const wake = b.connections.filter((c) => keepConn.has(c.id) && c.dormantAt).map((c) => c.id);
    if (newlySleeping.length) await prisma.socialConnection.updateMany({ where: { id: { in: newlySleeping }, dormantAt: null }, data: { dormantAt: now } });
    if (wake.length) await prisma.socialConnection.updateMany({ where: { id: { in: wake } }, data: { dormantAt: null } });
    dormantConnections += newlySleeping.length;
    sleepingConnectionIds.push(...sleep.map((c) => c.id));
  }

  // Publications : 7 jours de grâce après la fin de l'essai (ou maintenant).
  const base = reason === "trial_end" && user.trialEndsAt && user.trialEndsAt.getTime() < now.getTime() ? user.trialEndsAt : now;
  const graceEnd = new Date(base.getTime() + DORMANT_PUBLISH_GRACE_DAYS * DAY);
  const dormantBrandIds = brands.filter((b) => !keep.has(b.id)).map((b) => b.id);
  const drafted = await draftFarPosts(dormantBrandIds, sleepingConnectionIds, graceEnd);

  // Page bio (toujours en ligne, version Gratuit), rapports, calendrier client, media kit.
  const allIds = brands.map((b) => b.id);
  for (const brandId of allIds) {
    const page = await prisma.linkPage.findUnique({ where: { brandId }, select: { id: true, links: { orderBy: { order: "asc" }, select: { id: true, enabled: true } } } });
    if (page && page.links.length > free.maxBioLinks) {
      const extra = page.links.slice(free.maxBioLinks).filter((l) => l.enabled).map((l) => l.id);
      if (extra.length) await prisma.linkItem.updateMany({ where: { id: { in: extra } }, data: { enabled: false } });
    }
    if (page) await invalidateLinkPage(brandId);
  }
  if (!free.reportsEnabled) await prisma.brandReport.updateMany({ where: { brandId: { in: allIds }, enabled: true }, data: { enabled: false } });
  if (!free.calendarShareEnabled) await prisma.calendarShare.updateMany({ where: { brandId: { in: allIds }, enabled: true }, data: { enabled: false } });
  if (!free.mediaKitEnabled) {
    const { count } = await mediaKitDb.updateMany({ where: { brandId: { in: allIds }, published: true }, data: { published: false } });
    if (count) for (const brandId of allIds) await invalidateMediaKit(brandId);
  }

  if (drafted > 0) {
    const date = graceEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
    await notifyOnce(userId, {
      kind: "reminder",
      title: "Publications repassées en brouillon",
      body: `${drafted} publication${drafted > 1 ? "s" : ""} prévue${drafted > 1 ? "s" : ""} après le ${date} ${drafted > 1 ? "sont repassées" : "est repassée"} en brouillon. Elle${drafted > 1 ? "s repartent" : " repart"} dès que vous passez en Pro.`,
      href: "/calendar",
      actionLabel: "Voir le calendrier",
      dedupeKey: `free-limits:${reason}:${now.toISOString().slice(0, 10)}`
    });
  }

  return { applied: true, activeBrandId: active?.id ?? null, dormantBrands: toSleep.length, dormantConnections, drafted, graceEnd };
}

// --- Choix de la marque active -------------------------------------------------------

export type ChooseResult = { ok: true; activeBrandId: string; applied: FreeLimitsResult | null } | { ok: false; status: number; error: string; changeableAt?: string };

/**
 * « Choisir ce que je garde » (avant la fin de l'essai : libre) et « En faire
 * ma marque active » (en Gratuit : une fois tous les 30 jours, les deux
 * marques échangent leurs états).
 */
export async function chooseActiveBrand(userId: string, brandId: string, connectionIds: string[] | null, now: Date = new Date()): Promise<ChooseResult> {
  const owned = await prisma.membership.findFirst({ where: { userId, brandId, role: "OWNER" }, select: { id: true } });
  if (!owned) return { ok: false, status: 404, error: "Marque introuvable." };
  const brandConnections = connectionIds
    ? (await prisma.socialConnection.findMany({ where: { brandId, id: { in: connectionIds } }, select: { id: true } })).map((c) => c.id)
    : null;
  const info = await getUserPlan(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { freeActiveBrandId: true, activeBrandChangedAt: true, freeActiveConnectionIds: true } });
  if (!user) return { ok: false, status: 404, error: "Compte introuvable." };
  // Liste vide = pas de choix de comptes (les plus utilisés sont gardés).
  const data = { freeActiveBrandId: brandId, freeActiveConnectionIds: brandConnections ?? [] };

  // Essai, payant ou accès offert : simple choix pour plus tard.
  if (info.paid || info.comp || info.onTrial) {
    await prisma.user.update({ where: { id: userId }, data });
    return { ok: true, activeBrandId: brandId, applied: null };
  }

  const sameBrand = user.freeActiveBrandId === brandId;
  const sameConnections = JSON.stringify(chosenConnectionIds(user.freeActiveConnectionIds)) === JSON.stringify(brandConnections?.length ? brandConnections : null);
  if (sameBrand && (connectionIds === null || sameConnections)) return { ok: true, activeBrandId: brandId, applied: null };
  if (user.activeBrandChangedAt) {
    const next = new Date(user.activeBrandChangedAt.getTime() + ACTIVE_BRAND_CHANGE_DAYS * DAY);
    if (next.getTime() > now.getTime()) {
      return {
        ok: false,
        status: 429,
        error: `Vous avez déjà changé votre choix le ${user.activeBrandChangedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })} : prochain changement possible le ${next.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}. En Pro, toutes vos marques sont actives.`,
        changeableAt: next.toISOString()
      };
    }
  }
  await prisma.user.update({ where: { id: userId }, data: { ...data, activeBrandChangedAt: now } });
  const applied = await applyFreeLimits(userId, "swap", now);
  return { ok: true, activeBrandId: brandId, applied };
}

// --- Réactivation --------------------------------------------------------------------

export interface ReactivationResult {
  reactivatedBrands: number;
  reactivatedConnections: number;
  /** Brouillons dont la date d'origine est encore à venir (bouton « Reprogrammer »). */
  reschedulable: number;
}

/** Abonnement (webhook Stripe) ou accès offert : dormantAt effacé dans la limite du palier. Idempotente. */
export async function reactivateAfterUpgrade(userId: string, now: Date = new Date()): Promise<ReactivationResult> {
  const info = await getUserPlan(userId);
  if (!(info.paid || info.comp)) return { reactivatedBrands: 0, reactivatedConnections: 0, reschedulable: 0 };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { freeActiveBrandId: true } });
  const brands = await brandActivity(userId, now);
  // Ordre : la marque active, puis celles déjà actives, puis les plus utilisées.
  const ordered = [
    ...brands.filter((b) => b.id === user?.freeActiveBrandId),
    ...sortByUsage(brands.filter((b) => b.id !== user?.freeActiveBrandId && !b.dormantAt)),
    ...sortByUsage(brands.filter((b) => b.id !== user?.freeActiveBrandId && b.dormantAt))
  ];
  const keep = ordered.slice(0, info.maxBrands);
  const wakeBrands = keep.filter((b) => b.dormantAt).map((b) => b.id);
  if (wakeBrands.length) await prisma.brand.updateMany({ where: { id: { in: wakeBrands } }, data: { dormantAt: null } });
  let reactivatedConnections = 0;
  for (const b of keep) {
    const keepConn = pickConnectionsToKeep(b.connections, info.limits.maxConnections, null);
    const wake = b.connections.filter((c) => c.dormantAt && keepConn.has(c.id)).map((c) => c.id);
    if (wake.length) {
      await prisma.socialConnection.updateMany({ where: { id: { in: wake } }, data: { dormantAt: null } });
      reactivatedConnections += wake.length;
    }
  }
  const reschedulable = await countReschedulable(userId, now);
  return { reactivatedBrands: wakeBrands.length, reactivatedConnections, reschedulable };
}

function reschedulableWhere(userId: string, now: Date): Prisma.PostWhereInput {
  return {
    status: "DRAFT",
    dormantScheduledAt: { gt: now },
    brand: { dormantAt: null, memberships: { some: { userId, role: "OWNER" } } },
    NOT: { targets: { some: { connection: { dormantAt: { not: null } } } } }
  };
}

export async function countReschedulable(userId: string, now: Date = new Date()): Promise<number> {
  return prisma.post.count({ where: reschedulableWhere(userId, now) });
}

/**
 * « Reprogrammer les n publications » : les brouillons des marques actives
 * repartent à leur date d'origine si elle est encore à venir ; celles dont la
 * date est passée restent en brouillon (marqueur effacé). Idempotente.
 */
export async function rescheduleDormantPosts(userId: string, now: Date = new Date()): Promise<{ rescheduled: number; expired: number }> {
  const posts = await prisma.post.findMany({ where: reschedulableWhere(userId, now), select: { id: true, dormantScheduledAt: true } });
  let rescheduled = 0;
  for (const post of posts) {
    if (!post.dormantScheduledAt) continue;
    const { count } = await prisma.post.updateMany({
      where: { id: post.id, status: "DRAFT", dormantScheduledAt: { gt: now } },
      data: { status: "SCHEDULED", scheduledAt: post.dormantScheduledAt, dormantScheduledAt: null }
    });
    if (count === 0) continue;
    await prisma.postTarget.updateMany({ where: { postId: post.id, status: "PENDING" }, data: { status: "SCHEDULED" } });
    rescheduled += 1;
  }
  // Dates dépassées pendant la veille : brouillons ordinaires désormais.
  const expired = await prisma.post.updateMany({
    where: { status: "DRAFT", dormantScheduledAt: { lte: now }, brand: { dormantAt: null, memberships: { some: { userId, role: "OWNER" } } } },
    data: { dormantScheduledAt: null }
  });
  return { rescheduled, expired: expired.count };
}

/**
 * Filet du cron : comptes redevenus payants (ou offerts) qui ont encore des
 * marques en veille (fin de pause sans webhook, webhook perdu…). Petit lot.
 */
export async function reactivatePaidOwners(limit = 25): Promise<number> {
  const owners = await prisma.membership.findMany({
    where: {
      role: "OWNER",
      brand: { dormantAt: { not: null } },
      user: { OR: [{ subscription: { status: { in: ["ACTIVE", "TRIALING"] }, plan: { not: "FREE" } } }, { compPlan: { not: null } }] }
    },
    select: { userId: true },
    distinct: ["userId"],
    take: limit
  });
  let done = 0;
  for (const o of owners) {
    const r = await reactivateAfterUpgrade(o.userId).catch(() => null);
    if (r && r.reactivatedBrands > 0) done += 1;
  }
  return done;
}
