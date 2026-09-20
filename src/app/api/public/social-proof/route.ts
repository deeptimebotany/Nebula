import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NETWORK_META, type Network } from "@/lib/types";

// GET /api/public/social-proof — alimente la notification discrète et le
// compteur d'heures économisées de la page d'accueil (voir SocialProof sur
// page.tsx). Public, sans authentification, et STRICTEMENT anonymisé :
// on ne renvoie ni nom de marque, ni titre de publication, ni aucun
// identifiant — uniquement le réseau ciblé et l'ancienneté relative de la
// publication la plus récente, tirés des vraies publications de l'instance.
// Le "temps économisé" reste une estimation clairement présentée comme
// telle (même hypothèse que le calculateur de ROI de la page Facturation :
// une publication Nebula = 1 seule rédaction pour tous les réseaux visés),
// jamais un chiffre inventé de toutes pièces.
const MINUTES_SAVED_PER_TARGET = 5; // hypothèse : ~5 min économisées par réseau additionnel touché en un clic

export async function GET() {
  const [recentTarget, totalTargets] = await Promise.all([
    prisma.postTarget.findFirst({
      where: { status: { in: ["PUBLISHED", "SCHEDULED"] } },
      orderBy: { id: "desc" },
      select: { network: true, status: true, post: { select: { createdAt: true } } }
    }),
    prisma.postTarget.count({ where: { status: { in: ["PUBLISHED", "SCHEDULED"] } } })
  ]);

  const savedHours = Math.round((totalTargets * MINUTES_SAVED_PER_TARGET) / 60);

  if (!recentTarget) {
    return NextResponse.json({ hasActivity: false, savedHours });
  }

  const minutesAgo = Math.max(1, Math.round((Date.now() - recentTarget.post.createdAt.getTime()) / 60000));

  return NextResponse.json({
    hasActivity: true,
    network: recentTarget.network,
    networkLabel: NETWORK_META[recentTarget.network as Network]?.label ?? recentTarget.network,
    action: recentTarget.status === "SCHEDULED" ? "a programmé" : "vient de publier",
    minutesAgo,
    savedHours
  });
}
