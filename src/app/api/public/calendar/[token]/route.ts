import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeUpcomingPosts } from "@/lib/calendar-share";

// GET /api/public/calendar/[token] — consultée par la page publique
// /calendrier/[token] (aucune authentification, comme /api/public/reports/[token]
// et /api/public/link-in-bio/[slug] : le token, déjà unique, sert
// d'identifiant public). Ne renvoie jamais un calendrier désactivé, même si
// son contenu existe déjà en base.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const share = await prisma.calendarShare.findUnique({
    where: { token: params.token },
    select: { brandId: true, enabled: true, windowDays: true }
  });

  if (!share || !share.enabled) {
    return NextResponse.json({ error: "Ce calendrier n'existe pas ou n'est plus disponible." }, { status: 404 });
  }

  const [brand, posts] = await Promise.all([
    prisma.brand.findUnique({ where: { id: share.brandId }, select: { name: true } }),
    computeUpcomingPosts(share.brandId, share.windowDays)
  ]);

  return NextResponse.json({
    brandName: brand?.name ?? "Marque",
    windowDays: share.windowDays,
    posts
  });
}
