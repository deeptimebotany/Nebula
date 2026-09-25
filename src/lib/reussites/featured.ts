// Vidéo à la une dans la Communauté (Réussites v2, lot C) — serveur.
//
// Règles (conception validée par Lucas, lot C) :
//  - seulement une vidéo DÉJÀ partagée dans la Communauté (« Vidéos du
//    jour » : un lien vers le réseau, jamais une copie du fichier) ;
//  - seulement si le créateur a donné son accord (User.featureConsent),
//    retirable à tout moment : retirer son accord retire ses vidéos ;
//  - 7 jours, 3 vidéos à la fois ; au-delà, la vidéo attend la première
//    place libre (file d'attente) ;
//  - gagnée au rang Constellation I ou dans le coffre (5 %) : un « ticket »
//    (ReussiteItem « feature ») à utiliser sur la vidéo de son choix ;
//  - le propriétaire du site peut mettre une vidéo à la une (source
//    « admin ») ou en retirer une (droit de retrait) ;
//  - places libres : vidéos partagées récemment par des créateurs qui ont
//    donné leur accord (« Sélection du moment », rien d'enregistré).
import { prisma } from "@/lib/prisma";
import { reussiteItemDb } from "@/lib/prisma-extra";
import type { ActionResult } from "./weekly";

export const FEATURE_DAYS = 7;
export const FEATURE_SLOTS = 3;
const DAY = 86_400_000;
/** Vidéos partagées depuis moins de 30 jours pour compléter les places libres. */
const AUTO_WINDOW_DAYS = 30;

export interface FeaturedRow {
  id: string;
  userId: string;
  sharedVideoId: string;
  source: string;
  startsAt: Date;
  endsAt: Date;
  removedAt: Date | null;
  removedBy: string | null;
  createdAt: Date;
}

interface FeaturedDelegate {
  findMany(args: unknown): Promise<(FeaturedRow & Record<string, unknown>)[]>;
  findFirst(args: unknown): Promise<FeaturedRow | null>;
  findUnique(args: unknown): Promise<FeaturedRow | null>;
  create(args: unknown): Promise<FeaturedRow>;
  update(args: unknown): Promise<FeaturedRow>;
  updateMany(args: unknown): Promise<{ count: number }>;
  delete(args: unknown): Promise<FeaturedRow>;
}
const featuredDb = (prisma as unknown as { featuredVideo: FeaturedDelegate }).featuredVideo;

interface SharedVideoRow {
  id: string;
  authorId: string;
  network: string;
  title: string;
  externalUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  author?: { id: string; name: string; featureConsent?: boolean };
}

/**
 * Début d'une nouvelle mise à la une : tout de suite s'il reste une place,
 * sinon à la fin la plus proche parmi les 3 dernières programmées.
 */
export function nextStart(endsAt: Date[], now: Date, slots = FEATURE_SLOTS): Date {
  const upcoming = endsAt.map((d) => d.getTime()).filter((t) => t > now.getTime()).sort((a, b) => a - b);
  if (upcoming.length < slots) return now;
  return new Date(upcoming[upcoming.length - slots]);
}

async function scheduledEnds(now: Date): Promise<Date[]> {
  const rows = await featuredDb.findMany({ where: { removedAt: null, endsAt: { gt: now } }, select: { endsAt: true } });
  return rows.map((r) => new Date(r.endsAt));
}

/** Tickets « vidéo à la une » disponibles (gagnés − utilisés). */
export async function featureTickets(userId: string): Promise<number> {
  const rows = await reussiteItemDb.findMany({ where: { userId, item: "feature" }, select: { qty: true } });
  return Math.max(0, rows.reduce((n, r) => n + r.qty, 0));
}

/** Ticket du rang Constellation I (une seule fois, idempotent). */
export async function grantRankTicket(userId: string): Promise<boolean> {
  try {
    await reussiteItemDb.create({ data: { userId, item: "feature", qty: 1, reason: "rank:10" } });
    return true;
  } catch {
    return false;
  }
}

export interface FeaturedCard {
  id: string;
  sharedVideoId: string;
  title: string;
  network: string;
  externalUrl: string;
  thumbnailUrl: string | null;
  author: { id: string; name: string };
  /** « reward » (gagnée), « admin » (choix de Nebula) ou « auto » (sélection du moment). */
  source: "reward" | "admin" | "auto";
  endsAt: string | null;
}

function card(v: SharedVideoRow, source: FeaturedCard["source"], id: string, endsAt: Date | null): FeaturedCard {
  return {
    id,
    sharedVideoId: v.id,
    title: v.title,
    network: v.network,
    externalUrl: v.externalUrl,
    thumbnailUrl: v.thumbnailUrl,
    author: { id: v.author?.id ?? v.authorId, name: v.author?.name ?? "Créateur" },
    source,
    endsAt: endsAt ? endsAt.toISOString() : null
  };
}

/** Les 3 vidéos à la une maintenant (places libres complétées automatiquement). */
export async function currentFeatured(now: Date = new Date()): Promise<FeaturedCard[]> {
  const active = (await featuredDb.findMany({
    where: { removedAt: null, startsAt: { lte: now }, endsAt: { gt: now }, user: { featureConsent: true } },
    include: { sharedVideo: { include: { author: { select: { id: true, name: true } } } } },
    orderBy: { startsAt: "asc" },
    take: FEATURE_SLOTS
  })) as unknown as (FeaturedRow & { sharedVideo: SharedVideoRow })[];
  const out = active.map((f) => card(f.sharedVideo, f.source === "admin" ? "admin" : "reward", f.id, new Date(f.endsAt)));
  if (out.length < FEATURE_SLOTS) {
    const taken = new Set(out.map((c) => c.sharedVideoId));
    const authors = new Set(out.map((c) => c.author.id));
    const recent = (await prisma.sharedVideo.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - AUTO_WINDOW_DAYS * DAY) }, author: { featureConsent: true } },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30
    })) as unknown as SharedVideoRow[];
    for (const v of recent) {
      if (out.length >= FEATURE_SLOTS) break;
      if (taken.has(v.id) || authors.has(v.authorId)) continue; // une vidéo par créateur
      authors.add(v.authorId);
      out.push(card(v, "auto", `auto-${v.id}`, null));
    }
  }
  return out;
}

/** Mises à la une d'un créateur (en cours et à venir). */
export async function featuredOf(userId: string, now: Date = new Date()) {
  const rows = (await featuredDb.findMany({
    where: { userId, removedAt: null, endsAt: { gt: now } },
    include: { sharedVideo: { select: { title: true, network: true, externalUrl: true } } },
    orderBy: { startsAt: "asc" }
  })) as unknown as (FeaturedRow & { sharedVideo: { title: string; network: string; externalUrl: string } })[];
  return rows.map((r) => ({
    id: r.id,
    sharedVideoId: r.sharedVideoId,
    title: r.sharedVideo.title,
    network: r.sharedVideo.network,
    externalUrl: r.sharedVideo.externalUrl,
    startsAt: new Date(r.startsAt).toISOString(),
    endsAt: new Date(r.endsAt).toISOString(),
    live: new Date(r.startsAt) <= now
  }));
}

/** Accord du créateur. Le retirer retire aussi ses vidéos à la une. */
export async function setFeatureConsent(userId: string, consent: boolean, now: Date = new Date()): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { featureConsent: consent } });
  if (!consent) await featuredDb.updateMany({ where: { userId, removedAt: null, endsAt: { gt: now } }, data: { removedAt: now, removedBy: "creator" } });
}

async function schedule(userId: string, sharedVideoId: string, source: "reward" | "admin", now: Date): Promise<FeaturedRow> {
  const startsAt = nextStart(await scheduledEnds(now), now);
  return featuredDb.create({ data: { userId, sharedVideoId, source, startsAt, endsAt: new Date(startsAt.getTime() + FEATURE_DAYS * DAY) } });
}

/** Utiliser un ticket sur une de ses vidéos partagées. */
export async function spendFeatureTicket(userId: string, sharedVideoId: string, now: Date = new Date()): Promise<ActionResult<{ startsAt: string }>> {
  const [user, video] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { featureConsent: true } }),
    prisma.sharedVideo.findUnique({ where: { id: sharedVideoId }, select: { id: true, authorId: true } })
  ]);
  if (!user?.featureConsent) return { ok: false, status: 409, error: "Acceptez d'abord que vos vidéos partagées soient mises à la une." };
  if (!video || video.authorId !== userId) return { ok: false, status: 404, error: "Vidéo introuvable : partagez-la d'abord dans la Communauté." };
  const already = await featuredDb.findFirst({ where: { sharedVideoId, removedAt: null, endsAt: { gt: now } } });
  if (already) return { ok: false, status: 409, error: "Cette vidéo est déjà à la une (ou en attente)." };
  const rows = await reussiteItemDb.findMany({ where: { userId, item: "feature" }, select: { qty: true, reason: true } });
  const balance = rows.reduce((n, r) => n + r.qty, 0);
  if (balance < 1) return { ok: false, status: 409, error: "Aucun ticket « vidéo à la une » disponible." };
  // Dépense réservée par une raison unique : deux clics simultanés ne
  // dépensent jamais deux fois le même ticket.
  const used = rows.filter((r) => r.qty < 0).length;
  try {
    await reussiteItemDb.create({ data: { userId, item: "feature", qty: -1, reason: `feature-use:${used + 1}` } });
  } catch {
    return { ok: false, status: 409, error: "Ticket déjà utilisé : rechargez la page." };
  }
  const row = await schedule(userId, sharedVideoId, "reward", now);
  return { ok: true, startsAt: new Date(row.startsAt).toISOString() };
}

/** Le propriétaire du site met une vidéo à la une (créateur d'accord seulement). */
export async function adminFeature(sharedVideoId: string, now: Date = new Date()): Promise<ActionResult> {
  const video = (await prisma.sharedVideo.findUnique({ where: { id: sharedVideoId }, include: { author: { select: { featureConsent: true } } } })) as unknown as
    | (SharedVideoRow & { author: { featureConsent: boolean } })
    | null;
  if (!video) return { ok: false, status: 404, error: "Vidéo introuvable." };
  if (!video.author.featureConsent) return { ok: false, status: 409, error: "Ce créateur n'a pas donné son accord pour être à la une." };
  const already = await featuredDb.findFirst({ where: { sharedVideoId, removedAt: null, endsAt: { gt: now } } });
  if (already) return { ok: false, status: 409, error: "Déjà à la une (ou en attente)." };
  await schedule(video.authorId, sharedVideoId, "admin", now);
  return { ok: true };
}

/** Retirer une vidéo de la une : par son créateur, ou par le propriétaire du site. */
export async function removeFeatured(id: string, by: { userId: string; admin: boolean }, now: Date = new Date()): Promise<ActionResult> {
  const row = await featuredDb.findUnique({ where: { id } });
  if (!row || row.removedAt) return { ok: false, status: 404, error: "Introuvable." };
  if (!by.admin && row.userId !== by.userId) return { ok: false, status: 403, error: "Vous ne pouvez retirer que vos propres vidéos." };
  await featuredDb.update({ where: { id }, data: { removedAt: now, removedBy: by.admin && row.userId !== by.userId ? "admin" : "creator" } });
  return { ok: true };
}

/** Vue d'ensemble pour l'admin : en cours, en attente, et vidéos pouvant être mises à la une. */
export async function featuredAdminView(now: Date = new Date()) {
  const [scheduled, candidates] = await Promise.all([
    featuredDb.findMany({
      where: { removedAt: null, endsAt: { gt: now } },
      include: { sharedVideo: { select: { title: true, network: true, externalUrl: true } }, user: { select: { name: true } } },
      orderBy: { startsAt: "asc" }
    }) as unknown as Promise<(FeaturedRow & { sharedVideo: { title: string; network: string; externalUrl: string }; user: { name: string } })[]>,
    prisma.sharedVideo.findMany({
      where: { author: { featureConsent: true } },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30
    }) as unknown as Promise<SharedVideoRow[]>
  ]);
  const busy = new Set(scheduled.map((r) => r.sharedVideoId));
  return {
    scheduled: scheduled.map((r) => ({
      id: r.id,
      title: r.sharedVideo.title,
      network: r.sharedVideo.network,
      externalUrl: r.sharedVideo.externalUrl,
      author: r.user.name,
      source: r.source,
      startsAt: new Date(r.startsAt).toISOString(),
      endsAt: new Date(r.endsAt).toISOString(),
      live: new Date(r.startsAt) <= now
    })),
    candidates: candidates.map((v) => ({
      id: v.id,
      title: v.title,
      network: v.network,
      externalUrl: v.externalUrl,
      author: v.author?.name ?? "",
      createdAt: new Date(v.createdAt).toISOString(),
      /** Déjà à la une ou en attente : pas de second bouton. */
      featured: busy.has(v.id)
    }))
  };
}
