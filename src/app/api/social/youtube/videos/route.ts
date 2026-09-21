import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertBrandMembership } from "@/lib/brand-access";
import { fetchRecentVideos } from "@/lib/social/youtube";

// GET /api/social/youtube/videos?connectionId=... — liste les vidéos
// récentes de la chaîne YouTube connectée, pour le sélecteur de l'outil
// autonome de rétention (/retention). Contrairement au flux historique
// (analyser une publication déjà envoyée via Nebula), ceci fonctionne pour
// N'IMPORTE QUELLE vidéo de la chaîne.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "connectionId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const connection = await prisma.socialConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.network !== "YOUTUBE") {
    return NextResponse.json({ error: "Connexion YouTube introuvable." }, { status: 404 });
  }
  if (!(await assertBrandMembership(userId, connection.brandId))) {
    return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });
  }

  try {
    const videos = await fetchRecentVideos(connection);
    return NextResponse.json({ videos });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
