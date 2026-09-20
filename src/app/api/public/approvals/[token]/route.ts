import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/public/approvals/[token] — page publique consultée par le client
// de l'agence (aucune authentification : le token fait office de secret
// d'accès, comme un lien de partage classique). Renvoie les publications à
// venir (brouillons + programmées) de la marque, avec leur statut
// d'approbation, et crée à la volée une ligne PostApproval "PENDING" pour
// toute publication qui n'en a pas encore.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const link = await prisma.approvalLink.findUnique({ where: { token: params.token } });
  if (!link || link.revokedAt) {
    return NextResponse.json({ error: "Lien invalide ou révoqué." }, { status: 404 });
  }

  const [brand, owner] = await Promise.all([
    prisma.brand.findUnique({ where: { id: link.brandId }, select: { id: true, name: true, logoUrl: true } }),
    prisma.membership.findFirst({
      where: { brandId: link.brandId, role: "OWNER" },
      orderBy: { id: "asc" },
      select: { user: { select: { whiteLabelBrandName: true, whiteLabelLogoUrl: true } } }
    })
  ]);
  if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

  const posts = await prisma.post.findMany({
    where: { brandId: link.brandId, status: { in: ["DRAFT", "SCHEDULED"] } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      caption: true,
      scheduledAt: true,
      status: true,
      media: { take: 1, orderBy: { order: "asc" }, select: { mediaAsset: { select: { url: true, thumbnailUrl: true, type: true } } } },
      targets: { select: { network: true } },
      approval: true
    }
  });

  interface PostRow {
    id: string;
    title: string;
    caption: string;
    scheduledAt: Date | null;
    status: string;
    media: { mediaAsset: { url: string; thumbnailUrl: string | null; type: string } }[];
    targets: { network: string }[];
    approval: { status: string; comment: string | null } | null;
  }
  const typedPosts = posts as PostRow[];

  // Crée les lignes d'approbation manquantes (nouveaux posts depuis le
  // dernier passage du client) avant de renvoyer la liste.
  const missing = typedPosts.filter((p) => !p.approval);
  if (missing.length) {
    await prisma.postApproval.createMany({
      data: missing.map((p) => ({ postId: p.id })),
      skipDuplicates: true
    });
  }

  return NextResponse.json({
    brandName: owner?.user.whiteLabelBrandName || brand.name,
    logoUrl: owner?.user.whiteLabelLogoUrl || brand.logoUrl,
    posts: typedPosts.map((p) => ({
      id: p.id,
      title: p.title,
      caption: p.caption,
      scheduledAt: p.scheduledAt,
      status: p.status,
      networks: p.targets.map((t) => t.network),
      imageUrl: p.media[0]?.mediaAsset
        ? p.media[0].mediaAsset.type === "VIDEO"
          ? p.media[0].mediaAsset.thumbnailUrl ?? null
          : p.media[0].mediaAsset.url
        : null,
      approval: p.approval ?? { status: "PENDING", comment: null }
    }))
  });
}
