import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

// GET /api/posts/instagram-grid?brandId=... — "Simulateur de Feed Instagram"
// du Composer : les 8 dernières vraies vignettes (miniatures ou images)
// déjà ciblées sur Instagram pour cette marque, les plus récentes en
// premier — pour visualiser où le nouveau post s'intégrera visuellement.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const targets = await prisma.postTarget.findMany({
    where: { network: "INSTAGRAM", post: { brandId } },
    orderBy: { id: "desc" },
    take: 8,
    select: {
      post: {
        select: {
          media: {
            take: 1,
            orderBy: { order: "asc" },
            select: { mediaAsset: { select: { url: true, thumbnailUrl: true, type: true } } }
          }
        }
      }
    }
  });

  type MediaRow = { url: string; thumbnailUrl: string | null; type: string };
  const tiles = targets
    .map((t: { post: { media: { mediaAsset: MediaRow }[] } }) => t.post.media[0]?.mediaAsset)
    .filter((m: MediaRow | undefined): m is MediaRow => Boolean(m))
    // Vidéo sans miniature : imageUrl null (tuile « vidéo » côté aperçu),
    // jamais l'adresse du fichier vidéo affichée comme une image.
    .map((m: MediaRow) => ({ imageUrl: m.type === "VIDEO" ? m.thumbnailUrl ?? null : m.url }));

  return NextResponse.json({ tiles });
}
