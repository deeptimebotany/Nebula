// Media kit public (produit n°10) — lecture en base, réglages, données de la
// page publique et de l'éditeur. Serveur uniquement.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { NETWORKS, type Network } from "@/lib/types";
import { computeKitStats, interactionsOf, type KitConnectionRow, type KitMetricRow, type KitSnapshotRow } from "./stats";
import {
  ABOUT_MAX,
  HEADLINE_MAX,
  MAX_FEATURED_POSTS,
  MAX_OFFERS,
  OFFER_LABEL_MAX,
  OFFER_PRICE_MAX,
  type KitEditorDTO,
  type KitOffer,
  type KitPostChoice,
  type KitSettings,
  type PublicKitData
} from "./types";

const DAY = 86_400_000;
/** Relevés d'abonnés lus (l'évolution se compare à il y a 30 jours). */
const SNAPSHOT_DAYS = 120;
/** Publications lues : 12 mois (choix des mises en avant). */
const METRIC_DAYS = 365;

// --- Accès à la table (types minimaux, comme pour les autres nouveaux modèles) ---

export interface MediaKitRow {
  id: string;
  brandId: string;
  published: boolean;
  headline: string;
  about: string;
  contactEmail: string | null;
  hiddenConnectionIds: unknown;
  featuredPostIds: unknown;
  offers: unknown;
  views: number;
  lastViewedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MediaKitDelegate {
  findUnique(args: unknown): Promise<MediaKitRow | null>;
  upsert(args: unknown): Promise<MediaKitRow>;
  update(args: unknown): Promise<MediaKitRow>;
  updateMany(args: unknown): Promise<{ count: number }>;
  count(args: unknown): Promise<number>;
}
export const mediaKitDb = (prisma as unknown as { mediaKit: MediaKitDelegate }).mediaKit;

export function getOrCreateMediaKit(brandId: string): Promise<MediaKitRow> {
  return mediaKitDb.upsert({ where: { brandId }, create: { brandId }, update: {} });
}

// --- Réglages ------------------------------------------------------------------

const idList = z.array(z.string().max(40)).catch([]);
const offerList = z
  .array(z.object({ label: z.string(), price: z.string().catch("") }))
  .catch([])
  .transform((list) => cleanOffers(list));

export function cleanOffers(list: { label: string; price: string }[]): KitOffer[] {
  return list
    .map((o) => ({ label: o.label.replace(/\s+/g, " ").trim().slice(0, OFFER_LABEL_MAX), price: o.price.replace(/\s+/g, " ").trim().slice(0, OFFER_PRICE_MAX) }))
    .filter((o) => o.label.length > 0)
    .slice(0, MAX_OFFERS);
}

export function settingsFromRow(row: MediaKitRow | null): KitSettings {
  return {
    published: row?.published ?? false,
    headline: (row?.headline ?? "").slice(0, HEADLINE_MAX),
    about: (row?.about ?? "").slice(0, ABOUT_MAX),
    contactEmail: row?.contactEmail ?? null,
    hiddenConnectionIds: idList.parse(row?.hiddenConnectionIds ?? []),
    featuredPostIds: idList.parse(row?.featuredPostIds ?? []).slice(0, MAX_FEATURED_POSTS),
    offers: offerList.parse(row?.offers ?? [])
  };
}

// --- Sources des chiffres ---------------------------------------------------------

const isNetwork = (n: string): n is Network => (NETWORKS as readonly string[]).includes(n);

export interface KitSources {
  connections: KitConnectionRow[];
  snapshots: KitSnapshotRow[];
  metrics: KitMetricRow[];
}

export async function loadKitSources(brandId: string, now: Date): Promise<KitSources> {
  const rows = (await prisma.socialConnection.findMany({
    where: { brandId },
    select: { id: true, network: true, displayName: true, handle: true, avatarUrl: true, externalAccountId: true, status: true },
    orderBy: { connectedAt: "asc" }
  })) as (Omit<KitConnectionRow, "network"> & { network: string })[];
  const connections = rows.filter((c) => isNetwork(c.network)).map((c) => ({ ...c, network: c.network as Network }));
  const ids = connections.map((c) => c.id);
  if (ids.length === 0) return { connections, snapshots: [], metrics: [] };

  const [snapshots, metrics] = await Promise.all([
    prisma.analyticsSnapshot.findMany({
      where: { connectionId: { in: ids }, capturedAt: { gte: new Date(now.getTime() - SNAPSHOT_DAYS * DAY) } },
      select: { connectionId: true, capturedAt: true, followers: true },
      orderBy: { capturedAt: "asc" },
      take: 4000
    }) as Promise<KitSnapshotRow[]>,
    prisma.postMetric.findMany({
      where: { connectionId: { in: ids }, publishedAt: { gte: new Date(now.getTime() - METRIC_DAYS * DAY) } },
      select: { id: true, connectionId: true, network: true, title: true, permalink: true, thumbnailUrl: true, publishedAt: true, capturedAt: true, views: true, likes: true, comments: true, shares: true },
      orderBy: { publishedAt: "desc" },
      take: 800
    }) as Promise<(Omit<KitMetricRow, "network"> & { network: string })[]>
  ]);
  return {
    connections,
    snapshots,
    metrics: metrics.filter((m) => isNetwork(m.network)).map((m) => ({ ...m, network: m.network as Network }))
  };
}

interface KitBrand {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
}

export function buildKitData(brand: KitBrand, settings: KitSettings, sources: KitSources, now: Date): PublicKitData {
  const stats = computeKitStats({ ...sources, hiddenConnectionIds: settings.hiddenConnectionIds, featuredPostIds: settings.featuredPostIds, now });
  return {
    slug: brand.slug,
    brandName: brand.name,
    logoUrl: (brand.logoUrl && /^https:\/\//.test(brand.logoUrl) ? brand.logoUrl : null) ?? stats.accounts.find((a) => a.avatarUrl)?.avatarUrl ?? null,
    headline: settings.headline,
    about: settings.about,
    contactEmail: settings.contactEmail,
    offers: settings.offers,
    stats
  };
}

/** Kit publié d'une adresse, ou null (inconnue, non publiée, palier sans media kit). */
export async function getPublicKit(slug: string, now: Date = new Date()): Promise<PublicKitData | null> {
  if (!/^[\w.-]{1,120}$/.test(slug)) return null;
  const brand = (await prisma.brand.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, logoUrl: true } })) as KitBrand | null;
  if (!brand) return null;
  const row = await mediaKitDb.findUnique({ where: { brandId: brand.id } });
  if (!row?.published) return null;
  if (!(await getBrandPlan(brand.id)).limits.mediaKitEnabled) return null;
  return buildKitData(brand, settingsFromRow(row), await loadKitSources(brand.id, now), now);
}

/** Publications proposées dans l'éditeur : les 15 meilleures de chaque compte sur 12 mois. */
export function postChoicesFrom(sources: KitSources): KitPostChoice[] {
  const out: KitPostChoice[] = [];
  for (const c of sources.connections) {
    if (c.status === "DISCONNECTED") continue;
    const rows = sources.metrics.filter((m) => m.connectionId === c.id);
    const byViews = rows.filter((r) => r.views !== null && r.views > 0).length >= Math.ceil(rows.length / 2);
    const best = [...rows].sort((x, y) => (byViews ? (y.views ?? -1) - (x.views ?? -1) : 0) || interactionsOf(y) - interactionsOf(x)).slice(0, 15);
    for (const m of best) {
      out.push({
        id: m.id,
        connectionId: c.id,
        network: m.network,
        title: m.title?.replace(/\s+/g, " ").trim().slice(0, 140) || "Publication sans titre",
        permalink: m.permalink && /^https:\/\//.test(m.permalink) ? m.permalink : null,
        thumbnailUrl: m.thumbnailUrl && /^https:\/\//.test(m.thumbnailUrl) ? m.thumbnailUrl : null,
        publishedAt: m.publishedAt ? new Date(m.publishedAt).toISOString() : null,
        views: m.views,
        interactions: interactionsOf(m)
      });
    }
  }
  return out;
}

export async function getKitEditor(brandId: string, now: Date = new Date()): Promise<KitEditorDTO | null> {
  const brand = (await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, slug: true, name: true, logoUrl: true } })) as KitBrand | null;
  if (!brand) return null;
  const [row, plan, sources] = await Promise.all([getOrCreateMediaKit(brandId), getBrandPlan(brandId), loadKitSources(brandId, now)]);
  const settings = settingsFromRow(row);
  return {
    allowed: plan.limits.mediaKitEnabled,
    slug: brand.slug,
    settings,
    connections: sources.connections.map((c) => ({ id: c.id, network: c.network, name: c.displayName, handle: c.handle, status: c.status })),
    postChoices: postChoicesFrom(sources),
    preview: buildKitData(brand, settings, sources, now),
    views: row.views,
    lastViewedAt: row.lastViewedAt ? new Date(row.lastViewedAt).toISOString() : null,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null
  };
}
