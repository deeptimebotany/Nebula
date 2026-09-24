import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiJson, authenticateApi } from "@/lib/api/auth";
import { accessibleBrands } from "@/lib/api/access";
import { brandFor, isResponse } from "@/lib/api/context";
import { createPost } from "@/lib/posts/create-post";
import { postPayload } from "@/lib/webhooks";
import { NETWORKS, POST_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/v1/posts?brandId=&status=&from=&to=&limit=&cursor= — publications,
// les plus récentes d'abord (pagination par curseur : nextCursor).
export async function GET(req: NextRequest) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const sp = req.nextUrl.searchParams;

  let brandIds: string[];
  const brandId = sp.get("brandId");
  if (brandId) {
    const brand = await brandFor(auth.ctx, brandId);
    if (isResponse(brand)) return brand;
    brandIds = [brand.id];
  } else {
    brandIds = (await accessibleBrands(auth.ctx.userId, auth.ctx.brandId)).map((b) => b.id);
  }

  const status = sp.get("status");
  if (status && !(POST_STATUSES as readonly string[]).includes(status)) {
    return apiError(400, "invalid_status", `status doit valoir : ${POST_STATUSES.join(", ")}.`);
  }
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return apiError(400, "invalid_date", "from et to doivent être des dates ISO 8601.");
  }
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 25));
  const cursor = sp.get("cursor");

  const rows = await prisma.post.findMany({
    where: {
      brandId: { in: brandIds },
      ...(status ? { status } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true }
  });
  const page = (rows as { id: string }[]).slice(0, limit);
  const data = (await Promise.all(page.map((r) => postPayload(r.id)))).filter(Boolean);
  return apiJson({ data, nextCursor: rows.length > limit ? page[page.length - 1].id : null });
}

const createSchema = z
  .object({
    brandId: z.string().min(1),
    caption: z.string().max(63206).default(""),
    title: z.string().max(200).default(""),
    firstComment: z.string().max(2200).optional(),
    // Réseaux visés : le premier compte connecté de chaque réseau…
    networks: z.array(z.enum(NETWORKS)).optional(),
    // … ou des comptes précis (GET /api/v1/brands/{id}/connections).
    connectionIds: z.array(z.string().min(1)).max(20).optional(),
    // Médias déjà envoyés (POST /api/v1/media), dans l'ordre du carrousel.
    mediaIds: z.array(z.string().min(1)).max(20).default([]),
    // Date ISO 8601 future : publication programmée. Absente : brouillon,
    // sauf si publishNow vaut true.
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    publishNow: z.boolean().default(false),
    // Texte différent par réseau (ex. { "BLUESKY": { "caption": "…" } }).
    overrides: z.record(z.enum(NETWORKS), z.object({ caption: z.string().optional(), title: z.string().optional() })).optional()
  })
  .refine((v) => (v.networks?.length ?? 0) + (v.connectionIds?.length ?? 0) > 0, { message: "Indiquez networks ou connectionIds." });

// POST /api/v1/posts — crée une publication (brouillon, programmée, ou
// publiée tout de suite avec publishNow). Mêmes règles que Publier.
export async function POST(req: NextRequest) {
  const auth = await authenticateApi(req, "write");
  if (!auth.ok) return auth.res;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "invalid_body", "Corps de requête invalide.", { details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const input = parsed.data;
  const brand = await brandFor(auth.ctx, input.brandId, true);
  if (isResponse(brand)) return brand;

  // Comptes ciblés.
  const connections = (await prisma.socialConnection.findMany({
    where: { brandId: brand.id, status: { not: "DISCONNECTED" } },
    select: { id: true, network: true },
    orderBy: { connectedAt: "asc" }
  })) as { id: string; network: string }[];
  const chosen = new Map<string, { id: string; network: string }>();
  for (const id of input.connectionIds ?? []) {
    const c = connections.find((x) => x.id === id);
    if (!c) return apiError(400, "unknown_connection", `Compte ${id} introuvable dans cette marque.`);
    chosen.set(c.id, c);
  }
  for (const n of input.networks ?? []) {
    const c = connections.find((x) => x.network === n);
    if (!c) return apiError(400, "network_not_connected", `Aucun compte ${n} n'est connecté à cette marque.`);
    chosen.set(c.id, c);
  }

  const result = await createPost(auth.ctx.userId, {
    brandId: brand.id,
    title: input.title,
    caption: input.caption,
    firstComment: input.firstComment,
    scheduledAt: input.scheduledAt,
    mediaAssetIds: input.mediaIds,
    publishNow: input.publishNow,
    targets: Array.from(chosen.values()).map((c) => {
      const ov = input.overrides?.[c.network as (typeof NETWORKS)[number]];
      return { connectionId: c.id, network: c.network, captionOverride: ov?.caption || undefined, titleOverride: ov?.title || undefined };
    })
  });
  if (!result.ok) return apiError(result.status, result.reason ?? "rejected", result.error);
  return apiJson({ data: await postPayload(result.postId) }, 201);
}
