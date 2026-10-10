import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { instagramDeleteEnabled } from "@/lib/social/meta";
import { bulkDeletablePosts, summarizeBulkOnline, type BulkPost } from "@/lib/posts/bulk-delete";

// POST /api/posts/bulk-delete/preview { ids } — avant la suppression groupée
// (10/10/2026) : où les publications cochées sont-elles déjà en ligne, et
// lesquelles Nebula peut-il retirer de chaque réseau ? La fenêtre propose
// alors « Supprimer aussi sur … » réseau par réseau. Rien n'est modifié.
const bodySchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const ids = Array.from(new Set(parsed.data.ids));

  const posts: BulkPost[] = await prisma.post.findMany({
    where: { id: { in: ids }, brand: ownedBy(userId) },
    select: {
      id: true,
      status: true,
      targets: { select: { id: true, network: true, status: true, externalPostId: true, externalUrl: true, metadata: true, connection: { select: { scopes: true, status: true } } } }
    }
  });
  const deletable = bulkDeletablePosts(posts);
  return NextResponse.json({
    total: deletable.length,
    publishing: posts.length - deletable.length,
    networks: summarizeBulkOnline(posts, { instagramDeleteEnabled: instagramDeleteEnabled() })
  });
}
