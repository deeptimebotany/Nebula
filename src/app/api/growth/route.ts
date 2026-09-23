import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { isPublicGrowthEvent, sanitizeMeta, trackGrowth } from "@/lib/growth";

// POST /api/growth — événements de mesure envoyés par le navigateur (badge
// « Propulsé par Nebula », blocs de conversion, outils gratuits, modales de
// mise à niveau…). Liste blanche des noms, métadonnées bornées, jamais de
// donnée personnelle, limité par IP. Renvoie toujours 204 (sauf abus) : le
// navigateur n'attend rien en retour.
export async function POST(req: NextRequest) {
  const rate = await consumeRateLimit("growth", clientIpFromHeaders(req.headers), 120, 10);
  if (!rate.ok) return new NextResponse(null, { status: 429 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; meta?: unknown } | null;
  if (!body || !isPublicGrowthEvent(body.name)) return new NextResponse(null, { status: 204 });

  // Utilisateur connecté (modales, invitations au parrainage) : rattaché
  // pour les taux de conversion ; sinon anonyme.
  const session = await getServerSession(authOptions).catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  await trackGrowth(body.name, sanitizeMeta(body.meta), userId);
  return new NextResponse(null, { status: 204 });
}
