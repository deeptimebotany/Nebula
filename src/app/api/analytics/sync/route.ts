import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getSocialClient } from "@/lib/social";
import { NETWORK_META, type Network } from "@/lib/types";
import { checkAudienceMilestones } from "@/lib/easter-eggs/audience";
import { notifyMany, brandEditorIds, looksLikeAuthError, networkLabel } from "@/lib/notifications";
import { emitWebhookEvent } from "@/lib/webhooks";

// Interroge les vraies API de chaque réseau connecté pour rafraîchir les
// stats (abonnés, portée, impressions...) et enregistre un instantané.
// À appeler manuellement (bouton "Actualiser") ou via un cron (toutes les
// heures par ex.) une fois les comptes réellement connectés.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { brandId } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  // Réseaux sans statistiques de compte dans leur API (ex. LinkedIn, profil
  // personnel) : ignorés plutôt que marqués en erreur.
  const connections = (await prisma.socialConnection.findMany({ where: { brandId, status: "CONNECTED" } })).filter(
    (c: { network: string }) => NETWORK_META[c.network as Network]?.statsAvailable !== false
  );
  const results = [];

  for (const connection of connections) {
    try {
      const client = getSocialClient(connection.network as Network);
      const analytics = await client.fetchAnalytics(connection);
      await prisma.analyticsSnapshot.create({
        data: {
          connectionId: connection.id,
          network: connection.network,
          followers: analytics.followers,
          followersDelta: analytics.followersDelta,
          engagementRate: analytics.engagementRate,
          impressions: analytics.impressions,
          reach: analytics.reach,
          postsCount: analytics.postsCount,
          raw: analytics.raw ? JSON.stringify(analytics.raw) : null
        }
      });
      await prisma.socialConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), lastError: null } });
      results.push({ connectionId: connection.id, ok: true });
    } catch (err) {
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: { lastError: (err as Error).message }
      });
      // Connexion expirée ou révoquée : une seule alerte « à reconnecter »
      // par compte (dedupeKey), remise en haut si le problème persiste.
      if (looksLikeAuthError((err as Error).message)) {
        const label = networkLabel(connection.network);
        await notifyMany(await brandEditorIds(brandId), {
          kind: "reconnect",
          title: `${label} à reconnecter`,
          body: `La connexion à ${label}${connection.displayName ? ` (${connection.displayName})` : ""} a expiré : les statistiques et les publications sur ce compte sont en pause.`,
          href: "/accounts",
          actionLabel: `Reconnecter ${label}`,
          dedupeKey: `reconnect:${connection.id}`
        });
        await emitWebhookEvent(brandId, "connection.expired", {
          connection: { id: connection.id, network: connection.network, name: connection.displayName, handle: connection.handle },
          reason: (err as Error).message
        });
      }
      results.push({ connectionId: connection.id, ok: false, error: (err as Error).message });
    }
  }

  // Cadres de la page bio débloqués par les abonnés cumulés (voir
  // src/lib/easter-eggs/audience.ts).
  await checkAudienceMilestones((session.user as { id: string }).id);

  return NextResponse.json({ results });
}
