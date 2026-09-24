import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiJson, authenticateApi } from "@/lib/api/auth";
import { brandFor, isResponse } from "@/lib/api/context";
import { postPayload } from "@/lib/webhooks";
import { deletePostAndOrphanMedia } from "@/lib/posts/delete-post";

export const dynamic = "force-dynamic";

async function load(id: string) {
  return prisma.post.findUnique({ where: { id }, select: { id: true, brandId: true, status: true } });
}

// GET /api/v1/posts/{id} — une publication, avec l'état de chaque réseau.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApi(req, "read");
  if (!auth.ok) return auth.res;
  const post = await load(params.id);
  if (!post) return apiError(404, "post_not_found", "Publication introuvable.");
  const brand = await brandFor(auth.ctx, post.brandId);
  if (isResponse(brand)) return apiError(404, "post_not_found", "Publication introuvable.");
  return apiJson({ data: await postPayload(post.id) });
}

// DELETE /api/v1/posts/{id} — supprime un brouillon ou une publication
// programmée (une publication déjà en ligne reste sur les réseaux : à
// supprimer depuis chaque réseau).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApi(req, "write");
  if (!auth.ok) return auth.res;
  const post = await load(params.id);
  if (!post) return apiError(404, "post_not_found", "Publication introuvable.");
  const brand = await brandFor(auth.ctx, post.brandId, true);
  if (isResponse(brand)) return apiError(404, "post_not_found", "Publication introuvable.");
  if (post.status !== "DRAFT" && post.status !== "SCHEDULED") {
    return apiError(409, "not_deletable", "Seuls les brouillons et les publications programmées peuvent être supprimés par l'API.");
  }
  await deletePostAndOrphanMedia(post.id);
  return apiJson({ deleted: true, id: post.id });
}
