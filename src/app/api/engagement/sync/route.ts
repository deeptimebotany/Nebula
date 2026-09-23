import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";

// Interroge la vraie API du réseau pour rafraîchir les commentaires reçus
// sur les publications récentes, et les enregistre (déduplication via la
// contrainte unique [connectionId, externalId] — voir schema.prisma).
// Appelé depuis le bouton « Actualiser » de /comments : pour UN compte
// ({ connectionId }) ou pour TOUS les comptes d'une marque ({ brandId }).
// Avec plusieurs comptes, un réseau en échec ne bloque pas les autres : on
// renvoie le détail par compte.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = (await req.json().catch(() => ({}))) as { connectionId?: string; brandId?: string };
  if (!body.connectionId && !body.brandId) return NextResponse.json({ error: "connectionId ou brandId requis" }, { status: 400 });

  // Les comptes doivent appartenir à une des marques de l'utilisateur.
  const connections = await prisma.socialConnection.findMany({
    where: body.connectionId
      ? { id: body.connectionId, brand: ownedBy(userId) }
      : { brandId: body.brandId as string, status: "CONNECTED", brand: ownedBy(userId) }
  });
  if (connections.length === 0) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const results: { connectionId: string; network: string; count: number; error?: string; unsupported?: boolean }[] = [];

  for (const connection of connections) {
    const client = getSocialClient(connection.network as Network);
    if (!client.fetchEngagement) {
      results.push({ connectionId: connection.id, network: connection.network, count: 0, unsupported: true });
      continue;
    }
    try {
      const items = await client.fetchEngagement(connection);
      for (const item of items) {
        await prisma.engagementItem.upsert({
          where: { connectionId_externalId: { connectionId: connection.id, externalId: item.externalId } },
          create: {
            connectionId: connection.id,
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
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastEngagementSyncedAt: new Date() } });
      results.push({ connectionId: connection.id, network: connection.network, count: items.length });
    } catch (err) {
      results.push({ connectionId: connection.id, network: connection.network, count: 0, error: (err as Error).message });
    }
  }

  // Un seul compte demandé et en échec : on garde le comportement historique
  // (erreur HTTP), pour que le bouton « Actualiser » l'affiche clairement.
  if (body.connectionId) {
    const only = results[0];
    if (only?.unsupported) {
      return NextResponse.json({ error: `${only.network} ne permet pas de récupérer les commentaires via son API publique.` }, { status: 400 });
    }
    if (only?.error) return NextResponse.json({ error: only.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results, count: results.reduce((sum, r) => sum + r.count, 0) });
}
