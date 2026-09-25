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
    select: { mediaAsset: { select: { url: true, type: true, thumbnailUrl: true } } }
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
  return {
    status,
    network: network && /^[A-Z_]{2,20}$/.test(network) ? network : null,
    q,
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

export async function pageBrandPosts(brandId: string, query: PostPageQuery) {
  const conditions: Prisma.Sql[] = [Prisma.sql`p."brandId" = ${brandId}`];
  if (query.status !== "ALL") conditions.push(Prisma.sql`p."status" IN (${Prisma.join(STATUS_GROUPS[query.status])})`);
  if (query.network) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "PostTarget" t WHERE t."postId" = p."id" AND t."network" = ${query.network})`);
  }
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    conditions.push(Prisma.sql`(p."title" ILIKE ${like} OR p."caption" ILIKE ${like})`);
  }
  if (query.cursor) {
    // Dates stockées en UTC sans fuseau : comparaison sur la même forme.
    conditions.push(
      Prisma.sql`(COALESCE(p."scheduledAt", p."createdAt"), p."id") < (${query.cursor.at.toISOString()}::timestamp(3), ${query.cursor.id})`
    );
  }
  const rows = await prisma.$queryRaw<{ id: string; sortAt: Date }[]>(
    Prisma.sql`SELECT p."id", COALESCE(p."scheduledAt", p."createdAt") AS "sortAt"
               FROM "Post" p
               WHERE ${Prisma.join(conditions, " AND ")}
               ORDER BY "sortAt" DESC, p."id" DESC
               LIMIT ${query.limit + 1}`
  );
  const pageRows = rows.slice(0, query.limit);
  const found = await prisma.post.findMany({ where: { id: { in: pageRows.map((r) => r.id) } }, select: LIGHT_SELECT });
  const byId = new Map(found.map((p) => [p.id, p]));
  const posts = pageRows.map((r) => byId.get(r.id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const last = pageRows[pageRows.length - 1];
  const nextCursor = rows.length > query.limit && last ? encodePageCursor(new Date(last.sortAt), last.id) : null;
  return { posts, nextCursor };
}

/** Compteurs des onglets (avec les filtres réseau/recherche) et réseaux présents. */
export async function postPageSummary(brandId: string, query: PostPageQuery) {
  const [groups, networks] = await Promise.all([
    prisma.post.groupBy({ by: ["status"], where: pageFilterWhere(brandId, query), _count: { _all: true } }),
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
