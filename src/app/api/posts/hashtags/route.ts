import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/posts/hashtags?brandId=...&tags=voyage,ete
 * "Compteur de popularité des hashtags" du Composer/Importation : renvoie,
 * pour chaque hashtag tapé dans le titre/la description, le nombre de fois
 * où CETTE marque l'a déjà utilisé dans ses publications passées — une
 * vraie donnée tirée de votre historique, pas un indice de popularité
 * globale sur le réseau (aucune API de ce type n'est disponible sans un
 * accès "Insights" audité par chaque plateforme).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  const tagsParam = req.nextUrl.searchParams.get("tags");
  if (!brandId || !tagsParam) return NextResponse.json({ error: "brandId et tags requis" }, { status: 400 });
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const tags = Array.from(new Set(tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
  if (tags.length === 0) return NextResponse.json({ counts: {} });

  const counts: Record<string, number> = {};
  await Promise.all(
    tags.map(async (tag) => {
      counts[tag] = await prisma.post.count({
        where: {
          brandId,
          OR: [
            { caption: { contains: `#${tag}`, mode: "insensitive" } },
            { title: { contains: `#${tag}`, mode: "insensitive" } }
          ]
        }
      });
    })
  );

  return NextResponse.json({ counts });
}
