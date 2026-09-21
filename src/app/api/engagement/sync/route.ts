import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";

// Interroge la vraie API du réseau pour rafraîchir les commentaires reçus
// sur les publications récentes d'UN compte connecté, et les enregistre
// (déduplication via la contrainte unique [connectionId, externalId] — voir
// schema.prisma). Appelé depuis le bouton "Actualiser" de /interactions.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { connectionId } = await req.json();
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });

  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const client = getSocialClient(connection.network as Network);
  if (!client.fetchEngagement) {
    return NextResponse.json(
      { error: `${connection.network} ne permet pas de récupérer les commentaires via son API publique.` },
      { status: 400 }
    );
  }

  try {
    const items = await client.fetchEngagement(connection);
    for (const item of items) {
      await prisma.engagementItem.upsert({
        where: { connectionId_externalId: { connectionId, externalId: item.externalId } },
        create: {
          connectionId,
          network: connection.network,
          type: item.type,
          externalId: item.externalId,
          postExternalId: item.postExternalId,
          postPermalink: item.postPermalink,
          authorName: item.authorName,
          authorAvatarUrl: item.authorAvatarUrl,
          text: item.text,
          permalink: item.permalink,
          publishedAt: item.publishedAt
        },
        // Un commentaire déjà connu ne redevient jamais "non lu" au fil des
        // resynchronisations — seul son contenu peut évoluer (édité côté
        // réseau) ; `read` n'est donc volontairement pas dans `update`.
        update: {
          text: item.text,
          authorName: item.authorName,
          authorAvatarUrl: item.authorAvatarUrl,
          permalink: item.permalink
        }
      });
    }
    await prisma.socialConnection.update({
      where: { id: connectionId },
      data: { lastEngagementSyncedAt: new Date() }
    });
    return NextResponse.json({ ok: true, count: items.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
