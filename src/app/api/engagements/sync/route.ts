import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import type { Network } from "@/lib/types";
import { checkAudienceMilestones } from "@/lib/easter-eggs/audience";
import { onSyncError, onSyncSuccess, syncBlockedReason } from "@/lib/social/connection-health";
import { dormantSyncResponse, withoutDormant } from "@/lib/billing/dormant";
import { savePostMetrics } from "@/lib/social/metrics-store";
import { refreshReussites } from "@/lib/reussites/engine";

// « Actualiser » de la page /engagements : interroge l'API de chaque réseau
// (SocialClient.fetchPostMetrics) pour les comptes d'une marque, ou pour un
// seul compte, et met à jour PostMetric. Les valeurs précédentes sont
// décalées dans prev* pour afficher l'évolution depuis la dernière fois.
// Un réseau en échec (jeton expiré, API indisponible) n'empêche pas les
// autres : le détail est renvoyé par compte. Les mêmes relevés se font aussi
// une fois par jour tout seuls (src/lib/social/auto-sync.ts, Réussites v3).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = (await req.json().catch(() => ({}))) as { connectionId?: string; brandId?: string };
  if (!body.connectionId && !body.brandId) return NextResponse.json({ error: "connectionId ou brandId requis" }, { status: 400 });

  const found = await prisma.socialConnection.findMany({
    where: body.connectionId
      ? { id: body.connectionId, brand: ownedBy(userId) }
      : { brandId: body.brandId as string, status: "CONNECTED", brand: ownedBy(userId) }
  });
  if (found.length === 0) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  // Marque ou comptes en veille (lot E4) : aucune synchronisation.
  const connections = await withoutDormant(found);
  if (connections.length === 0) return dormantSyncResponse();

  const results: { connectionId: string; network: string; displayName: string; count: number; error?: string; unsupported?: boolean }[] = [];

  for (const connection of connections) {
    const client = getSocialClient(connection.network as Network);
    if (!client.fetchPostMetrics) {
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: 0, unsupported: true });
      continue;
    }
    const blocked = await syncBlockedReason(connection.network);
    if (blocked) {
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: 0, error: blocked });
      continue;
    }
    try {
      const inputs = await client.fetchPostMetrics(connection);
      await savePostMetrics(connection, inputs);
      await onSyncSuccess(connection);
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: inputs.length });
    } catch (err) {
      results.push({ connectionId: connection.id, network: connection.network, displayName: connection.displayName, count: 0, error: await onSyncError(connection, err) });
    }
  }

  // Cadres de la page bio débloqués par les j'aime cumulés.
  await checkAudienceMilestones(userId);
  // Réussites v3 : records de qualité (vues, engagement, rétention) mesurés
  // sur les chiffres qui viennent d'arriver.
  if (results.some((r) => r.count > 0)) await refreshReussites(userId);

  return NextResponse.json({ ok: true, results, count: results.reduce((sum, r) => sum + r.count, 0) });
}
