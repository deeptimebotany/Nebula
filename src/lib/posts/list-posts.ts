// Liste des publications d'une marque pour l'application (GET /api/posts).
// Audit performance, lot 4 : avant, chaque appel renvoyait TOUTES les
// publications de la marque avec toutes leurs données (médias complets,
// comptes, réglages par réseau), rechargées après chaque glisser-déposer.
//
// Désormais :
//  - `from` / `to` limitent à une période (date de programmation, ou date
//    de création pour une publication envoyée tout de suite) : le calendrier
//    ne charge que les mois affichés ;
//  - `view=light` ne renvoie que ce que les écrans affichent (titre, texte,
//    statut, dates, première miniature, réseaux et résultat par réseau) ;
//  - un plafond protège la base et le navigateur (`truncated` le signale).
// Sans paramètre, la réponse reste celle d'avant (compatibilité).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PUBLIC_CONNECTION_SELECT } from "@/lib/brand-access";
import { matchMetricRow } from "@/lib/posts/post-metrics";
import { isPostKind, postKinds, targetKind, type PostKind } from "@/lib/posts/post-kind";
import { removedFromNetworkAt } from "@/lib/social/remote-delete-support";
import { YOUTUBE_UPLOADS_LOCKED_PRIVATE } from "@/lib/social/youtube-audit";

export const MAX_RANGE_DAYS = 400;
export const MAX_POSTS_PER_REQUEST = 2000;

export interface PostListQuery {
  from: Date | null;
  to: Date | null;
  view: "full" | "light";
  limit: number;
}

export class PostListQueryError extends Error {}

function parseDate(raw: string | null, name: string): Date | null {
  if (raw === null || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new PostListQueryError(`Paramètre « ${name} » invalide : date ISO attendue.`);
  return d;
}

/** Lit et valide les paramètres de GET /api/posts. */
export function parsePostListQuery(params: URLSearchParams): PostListQuery {
  const from = parseDate(params.get("from"), "from");
  const to = parseDate(params.get("to"), "to");
  if (from && to) {
    if (to.getTime() <= from.getTime()) throw new PostListQueryError("« to » doit être après « from ».");
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new PostListQueryError(`Période trop longue (${MAX_RANGE_DAYS} jours au plus).`);
    }
  }
  const view = params.get("view") === "light" ? "light" : "full";
  const rawLimit = params.get("limit");
  let limit = MAX_POSTS_PER_REQUEST;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) throw new PostListQueryError("« limit » doit être un entier positif.");
    limit = Math.min(n, MAX_POSTS_PER_REQUEST);
  }
  return { from, to, view, limit };
}

/** Filtre de période : date de programmation, sinon date de création. */
export function periodWhere(from: Date | null, to: Date | null): Prisma.PostWhereInput {
  if (!from && !to) return {};
  const range: Prisma.DateTimeFilter = {};
  if (from) range.gte = from;
  if (to) range.lt = to;
  return { OR: [{ scheduledAt: range }, { scheduledAt: null, createdAt: range }] };
}

const LIGHT_SELECT = {
  id: true,
  title: true,
  caption: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  updatedAt: true,
  media: {
    orderBy: { order: "asc" },
    take: 1,
    // importSource : « Image importée depuis Canva » dans la liste (03/10/2026).
    select: { mediaAsset: { select: { url: true, type: true, thumbnailUrl: true, importSource: true } } }
  },
  targets: {
    select: { network: true, connectionId: true, status: true, errorMessage: true, publishedAt: true, externalUrl: true }
  }
} satisfies Prisma.PostSelect;

const FULL_INCLUDE = {
  media: { include: { mediaAsset: true } },
  targets: { include: { connection: { select: PUBLIC_CONNECTION_SELECT } } }
} satisfies Prisma.PostInclude;

export async function listBrandPosts(brandId: string, query: PostListQuery) {
  const where: Prisma.PostWhereInput = { brandId, ...periodWhere(query.from, query.to) };
  // Vue allégée : les plus récentes d'abord, pour que le plafond écarte les
  // plus anciennes (les écrans trient eux-mêmes). Vue complète : ordre
  // historique inchangé.
  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    query.view === "light" ? [{ createdAt: "desc" }, { id: "desc" }] : [{ scheduledAt: "asc" }, { createdAt: "desc" }];
  // Une ligne de plus que le plafond : sert seulement à savoir s'il y en a d'autres.
  const take = query.limit + 1;
  const rows =
    query.view === "light"
      ? await prisma.post.findMany({ where, select: LIGHT_SELECT, orderBy, take })
      : await prisma.post.findMany({ where, include: FULL_INCLUDE, orderBy, take });
  const truncated = rows.length > query.limit;
  return { posts: truncated ? rows.slice(0, query.limit) : rows, truncated };
}

// ---------------------------------------------------------------------------
// Page « Publications » paginée côté serveur (lot 5)
//
// Avant : jusqu'à 2 000 publications chargées d'un coup, filtrées et
// comptées dans le navigateur. Maintenant : pages de 50, de la plus récente
// à la plus ancienne (date de programmation, sinon de création), filtres
// (statut, réseau, recherche) et compteurs calculés par la base.
// ---------------------------------------------------------------------------
export const PAGE_SIZE = 50;
export const PAGE_STATUS_FILTERS = ["ALL", "SCHEDULED", "PUBLISHED", "FAILED", "DRAFT"] as const;
export type PageStatusFilter = (typeof PAGE_STATUS_FILTERS)[number];

/** Statuts réels regroupés sous chaque onglet de la page. */
export const STATUS_GROUPS: Record<Exclude<PageStatusFilter, "ALL">, string[]> = {
  SCHEDULED: ["SCHEDULED", "PUBLISHING"],
  PUBLISHED: ["PUBLISHED"],
  FAILED: ["FAILED", "PARTIAL"],
  DRAFT: ["DRAFT"]
};

export interface PostPageQuery {
  status: PageStatusFilter;
  network: string | null;
  q: string;
  /** Format (09/10/2026) : Shorts et Reels, vidéos, posts, stories (post-kind.ts). */
  kind: PostKind | null;
  /** Tri par date : plus récentes d'abord (défaut) ou plus anciennes d'abord. */
  order: "desc" | "asc";
  cursor: { at: Date; id: string } | null;
  limit: number;
}

export function encodePageCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodePageCursor(raw: string | null): { at: Date; id: string } | null {
  if (!raw) return null;
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const [iso, id] = text.split("|");
  const at = new Date(iso ?? "");
  if (!id || !/^[a-z0-9]{8,40}$/i.test(id) || Number.isNaN(at.getTime())) throw new PostListQueryError("Curseur de page invalide.");
  return { at, id };
}

export function parsePostPageQuery(params: URLSearchParams): PostPageQuery {
  const rawStatus = (params.get("status") ?? "ALL").toUpperCase();
  const status = (PAGE_STATUS_FILTERS as readonly string[]).includes(rawStatus) ? (rawStatus as PageStatusFilter) : "ALL";
  const network = params.get("network");
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const rawLimit = Number(params.get("limit") ?? PAGE_SIZE);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : PAGE_SIZE;
  const kind = (params.get("kind") ?? "").toUpperCase();
  return {
    status,
    network: network && /^[A-Z_]{2,20}$/.test(network) ? network : null,
    q,
    kind: isPostKind(kind) ? kind : null,
    order: params.get("order") === "asc" ? "asc" : "desc",
    cursor: decodePageCursor(params.get("cursor")),
    limit
  };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Filtres communs (réseau, recherche) — sans le statut, pour les compteurs. */
function pageFilterWhere(brandId: string, query: PostPageQuery): Prisma.PostWhereInput {
  return {
    brandId,
    ...(query.network ? { targets: { some: { network: query.network } } } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { caption: { contains: query.q, mode: "insensitive" } }] } : {})
  };
}

// --- Page Publications : tableau façon YouTube Studio (09/10/2026) ----------
// Pour chaque publication : formats par réseau (Short, vidéo, post, story),
// visibilité YouTube, et vues / commentaires / j'aime additionnés sur les
// réseaux affichés (relevés de la page Engagements, PostMetric).

const PAGE_SELECT = {
  id: true,
  title: true,
  caption: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  updatedAt: true,
  media: {
    orderBy: { order: "asc" },
    take: 1,
    select: { mediaAsset: { select: { url: true, type: true, thumbnailUrl: true, importSource: true, width: true, height: true, durationSeconds: true } } }
  },
  _count: { select: { media: true } },
  targets: {
    select: { id: true, network: true, connectionId: true, status: true, errorMessage: true, publishedAt: true, externalUrl: true, externalPostId: true, metadata: true }
  }
} satisfies Prisma.PostSelect;

type PageRow = Prisma.PostGetPayload<{ select: typeof PAGE_SELECT }>;

export type YoutubePrivacy = "public" | "private" | "unlisted";

export interface PagePostTarget {
  network: string;
  status: string;
  errorMessage: string | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  kind: PostKind;
  /** YouTube : confidentialité choisie dans Publier. */
  privacy: YoutubePrivacy | null;
  /** YouTube : vidéo envoyée en « Privée » d'office tant que l'audit n'est pas validé. */
  lockedPrivate: boolean;
  /** Retirée du réseau depuis Nebula. */
  removed: boolean;
}

export interface PageMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export interface PagePost {
  id: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  media: { mediaAsset: { url: string; type: string; thumbnailUrl: string | null; importSource: string | null; durationSeconds: number | null } }[];
  targets: PagePostTarget[];
  /** Formats des réseaux affichés (filtre réseau appliqué). */
  kinds: PostKind[];
  /** Chiffres additionnés des réseaux affichés ; null tant qu'aucun relevé. */
  metrics: PageMetrics | null;
}

function mediaFactsOf(row: Pick<PageRow, "media" | "_count">) {
  const m = row.media[0]?.mediaAsset;
  return {
    type: m ? (m.type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const)) : null,
    count: row._count.media,
    width: m?.width ?? null,
    height: m?.height ?? null,
    durationSeconds: m?.durationSeconds ?? null
  };
}

function shownTargets<T extends { network: string }>(targets: T[], network: string | null): T[] {
  return network ? targets.filter((t) => t.network === network) : targets;
}

function kindsOf(row: Pick<PageRow, "media" | "_count" | "targets">, network: string | null): PostKind[] {
  return postKinds(shownTargets(row.targets, network), mediaFactsOf(row));
}

function youtubePrivacy(metadata: unknown): YoutubePrivacy {
  const raw = (metadata as { privacyStatus?: unknown } | null)?.privacyStatus;
  return raw === "private" || raw === "unlisted" ? raw : "public";
}

async function decoratePagePosts(rows: PageRow[], network: string | null): Promise<PagePost[]> {
  const shown = rows.flatMap((r) => shownTargets(r.targets, network));
  const connectionIds = Array.from(new Set(shown.filter((t) => t.status === "PUBLISHED").map((t) => t.connectionId)));
  const metricRows = connectionIds.length
    ? await prisma.postMetric.findMany({
        where: { connectionId: { in: connectionIds } },
        select: { connectionId: true, postExternalId: true, permalink: true, publishedAt: true, views: true, likes: true, comments: true }
      })
    : [];
  return rows.map((row) => {
    const facts = mediaFactsOf(row);
    let metrics: PageMetrics | null = null;
    for (const t of shownTargets(row.targets, network)) {
      if (t.status !== "PUBLISHED") continue;
      const m = matchMetricRow(
        t,
        metricRows.filter((r) => r.connectionId === t.connectionId)
      );
      if (!m) continue;
      metrics ??= { views: null, likes: null, comments: null };
      for (const key of ["views", "likes", "comments"] as const) {
        const v = m[key];
        if (typeof v === "number") metrics[key] = (metrics[key] ?? 0) + v;
      }
    }
    const first = row.media[0]?.mediaAsset;
    return {
      id: row.id,
      title: row.title,
      caption: row.caption,
      status: row.status,
      scheduledAt: row.scheduledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      media: first
        ? [{ mediaAsset: { url: first.url, type: first.type, thumbnailUrl: first.thumbnailUrl, importSource: first.importSource, durationSeconds: first.durationSeconds } }]
        : [],
      targets: row.targets.map((t) => ({
        network: t.network,
        status: t.status,
        errorMessage: t.errorMessage,
        publishedAt: t.publishedAt,
        externalUrl: t.externalUrl,
        kind: targetKind(t.network, t.metadata, facts),
        privacy: t.network === "YOUTUBE" ? youtubePrivacy(t.metadata) : null,
        lockedPrivate: t.network === "YOUTUBE" && t.status === "PUBLISHED" && YOUTUBE_UPLOADS_LOCKED_PRIVATE,
        removed: Boolean(removedFromNetworkAt(t.metadata))
      })),
      kinds: kindsOf(row, network),
      metrics
    };
  });
}

/** Identifiants dans l'ordre de la page (filtres statut, réseau, recherche ; après le curseur). */
async function pageIds(brandId: string, query: PostPageQuery, cursor: { at: Date; id: string } | null, take: number) {
  const conditions: Prisma.Sql[] = [Prisma.sql`p."brandId" = ${brandId}`];
  if (query.status !== "ALL") conditions.push(Prisma.sql`p."status" IN (${Prisma.join(STATUS_GROUPS[query.status])})`);
  if (query.network) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "PostTarget" t WHERE t."postId" = p."id" AND t."network" = ${query.network})`);
  }
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    conditions.push(Prisma.sql`(p."title" ILIKE ${like} OR p."caption" ILIKE ${like})`);
  }
  if (cursor) {
    // Dates stockées en UTC sans fuseau : comparaison sur la même forme.
    conditions.push(
      query.order === "asc"
        ? Prisma.sql`(COALESCE(p."scheduledAt", p."createdAt"), p."id") > (${cursor.at.toISOString()}::timestamp(3), ${cursor.id})`
        : Prisma.sql`(COALESCE(p."scheduledAt", p."createdAt"), p."id") < (${cursor.at.toISOString()}::timestamp(3), ${cursor.id})`
    );
  }
  const direction = query.order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return prisma.$queryRaw<{ id: string; sortAt: Date }[]>(
    Prisma.sql`SELECT p."id", COALESCE(p."scheduledAt", p."createdAt") AS "sortAt"
               FROM "Post" p
               WHERE ${Prisma.join(conditions, " AND ")}
               ORDER BY "sortAt" ${direction}, p."id" ${direction}
               LIMIT ${take}`
  );
}

async function loadPageRows(ids: string[]): Promise<Map<string, PageRow>> {
  const found = ids.length ? await prisma.post.findMany({ where: { id: { in: ids } }, select: PAGE_SELECT }) : [];
  return new Map(found.map((p) => [p.id, p]));
}

/** Avec un filtre de format : lecture par paquets jusqu'à remplir la page. */
const KIND_SCAN_BATCH = 200;
const KIND_SCAN_MAX_BATCHES = 50;

export async function pageBrandPosts(brandId: string, query: PostPageQuery): Promise<{ posts: PagePost[]; nextCursor: string | null }> {
  let picked: { row: { id: string; sortAt: Date }; post: PageRow }[];
  let hasMore: boolean;
  if (!query.kind) {
    const rows = await pageIds(brandId, query, query.cursor, query.limit + 1);
    const byId = await loadPageRows(rows.slice(0, query.limit).map((r) => r.id));
    picked = rows
      .slice(0, query.limit)
      .map((row) => ({ row, post: byId.get(row.id) }))
      .filter((x): x is { row: { id: string; sortAt: Date }; post: PageRow } => Boolean(x.post));
    hasMore = rows.length > query.limit;
  } else {
    const matched: { row: { id: string; sortAt: Date }; post: PageRow }[] = [];
    let cursor = query.cursor;
    for (let batch = 0; batch < KIND_SCAN_MAX_BATCHES && matched.length <= query.limit; batch++) {
      const rows = await pageIds(brandId, query, cursor, KIND_SCAN_BATCH);
      if (rows.length === 0) break;
      const byId = await loadPageRows(rows.map((r) => r.id));
      for (const row of rows) {
        const post = byId.get(row.id);
        if (post && kindsOf(post, query.network).includes(query.kind)) matched.push({ row, post });
        if (matched.length > query.limit) break;
      }
      if (rows.length < KIND_SCAN_BATCH) break;
      const last = rows[rows.length - 1];
      cursor = { at: new Date(last.sortAt), id: last.id };
    }
    picked = matched.slice(0, query.limit);
    hasMore = matched.length > query.limit;
  }
  const posts = await decoratePagePosts(
    picked.map((p) => p.post),
    query.network
  );
  const last = picked[picked.length - 1];
  const nextCursor = hasMore && last ? encodePageCursor(new Date(last.row.sortAt), last.row.id) : null;
  return { posts, nextCursor };
}

/** Compteurs des onglets (avec les filtres réseau/recherche) et réseaux présents. */
export async function postPageSummary(brandId: string, query: PostPageQuery) {
  const [groups, networks] = await Promise.all([
    query.kind ? kindStatusGroups(brandId, query, query.kind) : prisma.post.groupBy({ by: ["status"], where: pageFilterWhere(brandId, query), _count: { _all: true } }),
    prisma.postTarget.findMany({ where: { post: { brandId } }, distinct: ["network"], select: { network: true } })
  ]);
  const byStatus = new Map((groups as { status: string; _count: { _all: number } }[]).map((g) => [g.status, g._count._all]));
  const sum = (statuses: string[]) => statuses.reduce((total, s) => total + (byStatus.get(s) ?? 0), 0);
  const counts: Record<PageStatusFilter, number> = {
    ALL: Array.from(byStatus.values()).reduce((a, b) => a + b, 0),
    SCHEDULED: sum(STATUS_GROUPS.SCHEDULED),
    PUBLISHED: sum(STATUS_GROUPS.PUBLISHED),
    FAILED: sum(STATUS_GROUPS.FAILED),
    DRAFT: sum(STATUS_GROUPS.DRAFT)
  };
  return { counts, networks: (networks as { network: string }[]).map((n) => n.network) };
}

/** Compteurs par statut avec un filtre de format : le format se calcule publication par publication. */
async function kindStatusGroups(brandId: string, query: PostPageQuery, kind: PostKind): Promise<{ status: string; _count: { _all: number } }[]> {
  const rows = await prisma.post.findMany({
    where: pageFilterWhere(brandId, query),
    select: { status: true, media: PAGE_SELECT.media, _count: PAGE_SELECT._count, targets: { select: { network: true, metadata: true } } },
    take: KIND_SCAN_BATCH * KIND_SCAN_MAX_BATCHES
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!postKinds(shownTargets(row.targets, query.network), mediaFactsOf(row)).includes(kind)) continue;
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return Array.from(counts, ([status, n]) => ({ status, _count: { _all: n } }));
}
