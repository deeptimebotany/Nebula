import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders, consumeRateLimit } from "@/lib/rate-limit";
import { mediaKitDb } from "@/lib/media-kit/load";

// POST /api/public/kit/<slug>/view — compte une ouverture du media kit,
// envoyée par la page publique une fois affichée (les robots d'aperçu de
// lien n'exécutent pas ce script). Sans cookie ni traceur : un visiteur
// (empreinte de son IP) compte une fois par jour et par kit ; les membres de
// la marque ne comptent pas. Toujours 204 : la mesure ne gêne jamais la visite.
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|headless/i;

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const done = new NextResponse(null, { status: 204 });
  const slug = params.slug;
  if (!/^[\w.-]{1,120}$/.test(slug) || BOT_UA.test(req.headers.get("user-agent") ?? "")) return done;
  try {
    const brand = (await prisma.brand.findUnique({ where: { slug }, select: { id: true } })) as { id: string } | null;
    if (!brand || !(await mediaKitDb.findUnique({ where: { brandId: brand.id } }))?.published) return done;
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId && (await prisma.membership.findFirst({ where: { userId, brandId: brand.id }, select: { id: true } }))) return done;
    const first = await consumeRateLimit(`kitview:${brand.id}`, clientIpFromHeaders(req.headers), 1, 1440);
    if (!first.ok) return done;
    await mediaKitDb.updateMany({ where: { brandId: brand.id, published: true }, data: { views: { increment: 1 }, lastViewedAt: new Date() } });
  } catch (err) {
    console.warn("[media-kit] vue non comptée :", (err as Error).message);
  }
  return done;
}
