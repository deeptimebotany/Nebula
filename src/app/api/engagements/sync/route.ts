import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";

// « Actualiser » de la page /engagements : interroge l'API de chaque réseau
// (SocialClient.fetchPostMetrics) pour les comptes d'une marque, ou pour un
// seul compte, et met à jour PostMetric. Les valeurs précédentes sont
// décalées dans prev* pour afficher l'évolution depuis la dernière fois.
// Un réseau en échec (jeton expiré, API indisponible) n'empêche pas les
// autres : le détail est renvoyé par compte.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = (await req.json().catch(() => ({}))) as { connectionId?: string; brandId?: string };
  if (!body.connectionId && !body.brandId) return NextResponse.json({ error: "connectionId ou brandId requis" }, { status: 400 });

  const connections = await prisma.socialConnection.findMany({
    where: body.connectionId
      ? { id: body.connectionId, brand: ownedBy(userId) }
      : { brandId: body.brandId as string, status: "CONNECTED", brand: ownedBy(userId) }
  });
  if (connections.length === 0) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const results: { connectionId: string; network: string; displayName: string; count: number; error?: string; unsupported?: boolean }[] = [];

  for (const connection of connections) {
    const client = getSocialClient(connection.network as Network);
    if (!client.fetchPostMetrics) {
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: 0, unsupported: true });
      continue;
    }
    try {
      const inputs = await client.fetchPostMetrics(connection);
      const now = new Date();
      for (const input of inputs) {
        const existing = await prisma.postMetric.findUnique({
          where: { connectionId_postExternalId: { connectionId: connection.id, postExternalId: input.postExternalId } }
        });
        const values = {
          title: input.title ?? existing?.title ?? null,
          permalink: input.permalink ?? existing?.permalink ?? null,
          thumbnailUrl: input.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
          publishedAt: input.publishedAt ?? existing?.publishedAt ?? null,
          views: input.views ?? null,
          likes: input.likes ?? null,
          comments: input.comments ?? null,
          shares: input.shares ?? null,
          saves: input.saves ?? null,
          capturedAt: now
        };
        if (existing) {
          await prisma.postMetric.update({
            where: { id: existing.id },
            data: {
              ...values,
              prevViews: existing.views,
              prevLikes: existing.likes,
              prevComments: existing.comments,
              prevShares: existing.shares,
              prevSaves: existing.saves,
              prevCapturedAt: existing.capturedAt
            }
          });
        } else {
          await prisma.postMetric.create({
            data: { connectionId: connection.id, network: connection.network, postExternalId: input.postExternalId, ...values }
          });
        }
      }
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastMetricsSyncedAt: now } });
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: inputs.length });
    } catch (err) {
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: 0, error: (err as Error).message });
    }
  }

  return NextResponse.json({ ok: true, results, count: results.reduce((sum, r) => sum + r.count, 0) });
}
