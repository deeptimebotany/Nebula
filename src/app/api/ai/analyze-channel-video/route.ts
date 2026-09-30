import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertBrandMembership } from "@/lib/brand-access";
import { isAiEnabled } from "@/lib/ai/gemini";
import { runRetentionAnalysis } from "@/lib/ai/retention-run";

// GET/POST /api/ai/analyze-channel-video — Rétention IA pour n'importe
// quelle vidéo de la chaîne YouTube connectée ({ connectionId, videoId }),
// voir /retention. Depuis le 30/09/2026, l'IA regarde la vidéo quand elle
// est publique (src/lib/ai/retention.ts, retention-run.ts) ; une analyse
// déjà faite est réutilisée sauf « Refaire l'analyse » (force: true).
// Jusqu'à 300 s (vidéos de 20 minutes, Vercel avec Fluid compute).
export const maxDuration = 300;

async function resolveConnection(userId: string, connectionId: string) {
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.network !== "YOUTUBE") return null;
  if (!(await assertBrandMembership(userId, connection.brandId))) return null;
  return connection;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!connectionId || !videoId) return NextResponse.json({ error: "connectionId et videoId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const connection = await resolveConnection(userId, connectionId);
  if (!connection) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });

  const insight = await prisma.videoInsight.findFirst({
    where: { connectionId, videoId },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({ insight });
}

const bodySchema = z.object({ connectionId: z.string().min(1), videoId: z.string().min(1), force: z.boolean().optional() });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isAiEnabled()) {
    return NextResponse.json({ error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { connectionId, videoId, force } = parsed.data;

  const userId = (session.user as { id: string }).id;
  const connection = await resolveConnection(userId, connectionId);
  if (!connection) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });

  return runRetentionAnalysis({ userId, brandId: connection.brandId, connection, videoId, connectionId, force: Boolean(force) });
}
