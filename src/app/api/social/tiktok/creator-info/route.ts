import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { consumeRateLimit } from "@/lib/rate-limit";
import { SocialApiError } from "@/lib/social/base";
import { fetchTiktokCreatorInfo } from "@/lib/social/tiktok";

export const dynamic = "force-dynamic";

// GET /api/social/tiktok/creator-info?connectionId=… — section TikTok de
// Publier (règles Direct Post, 30/09/2026) : compte qui va publier (pseudo,
// avatar), confidentialités proposées, interactions coupées par le créateur,
// durée maximale. 6 appels par minute et par compte au plus (TikTok en
// autorise davantage ; Publier ne l'appelle qu'à l'ouverture de la section).

/** Le créateur ne peut pas publier pour le moment : on le dit et on bloque. */
const CANNOT_POST: Record<string, string> = {
  spam_risk_too_many_posts: "Ce compte TikTok a atteint sa limite de publications pour aujourd'hui. Réessayez plus tard.",
  spam_risk_user_banned_from_posting: "TikTok n'autorise plus ce compte à publier pour le moment.",
  reached_active_user_cap: "TikTok limite pour aujourd'hui le nombre de comptes qui publient depuis Nebula. Réessayez plus tard."
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.network !== "TIKTOK") return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const denied = await requireBrandMembership(userId, connection.brandId);
  if (denied) return denied;

  const rate = await consumeRateLimit("tiktok-creator-info", connection.id, 6, 1);
  if (!rate.ok) return NextResponse.json({ error: "Trop de vérifications du compte TikTok d'un coup : réessayez dans une minute." }, { status: 429 });

  try {
    const creator = await fetchTiktokCreatorInfo(connection);
    return NextResponse.json({ creator });
  } catch (err) {
    const code = err instanceof SocialApiError ? err.code : undefined;
    if (code && CANNOT_POST[code]) return NextResponse.json({ error: CANNOT_POST[code], code, cannotPost: true }, { status: 409 });
    if (code === "access_token_invalid" || code === "invalid_grant" || (err instanceof SocialApiError && err.status === 401)) {
      return NextResponse.json({ error: "Connexion TikTok expirée : reconnectez le compte depuis la page Comptes.", code: "reconnect", cannotPost: true }, { status: 409 });
    }
    if (code === "scope_not_authorized") {
      return NextResponse.json({ error: "Ce compte TikTok n'a pas autorisé la publication : reconnectez-le depuis la page Comptes.", code, cannotPost: true }, { status: 409 });
    }
    return NextResponse.json({ error: `Impossible de joindre TikTok pour le moment (${(err as Error).message.replace(/^\[TIKTOK\]\s*/, "")}).` }, { status: 502 });
  }
}
