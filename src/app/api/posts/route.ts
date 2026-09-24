import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPost } from "@/lib/posts/create-post";
import { requireBrandMembership, PUBLIC_CONNECTION_SELECT } from "@/lib/brand-access";
import { z } from "zod";

const targetSchema = z.object({
  connectionId: z.string(),
  network: z.string(),
  titleOverride: z.string().optional(),
  captionOverride: z.string().optional(),
  // Préréglages propres à ce réseau (ex. YoutubeOptions du composer) —
  // stockés tels quels en JSON (voir schema.prisma → PostTarget.metadata),
  // aucune validation de forme ici : chaque client (youtube.ts, etc.)
  // n'applique que les clés qu'il connaît et retombe sur ses valeurs par
  // défaut pour le reste.
  metadata: z.record(z.any()).optional()
});
const bodySchema = z.object({
  brandId: z.string(),
  title: z.string().default(""),
  caption: z.string().default(""),
  firstComment: z.string().max(2200).optional(),
  scheduledAt: z.string().datetime().optional(),
  mediaAssetIds: z.array(z.string()).default([]),
  targets: z.array(targetSchema).min(1),
  publishNow: z.boolean().default(false)
});

// GET /api/posts?brandId=... — liste (utilisé par le calendrier)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  // Appartenance vérifiée côté serveur : sans ça, n'importe quel compte
  // connecté pouvait lister les publications (et, avant le `select` ci-dessous,
  // les jetons OAuth) de n'importe quelle marque en devinant son brandId.
  const userId = (session.user as { id: string }).id;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  const posts = await prisma.post.findMany({
    where: { brandId },
    include: {
      media: { include: { mediaAsset: true } },
      targets: { include: { connection: { select: PUBLIC_CONNECTION_SELECT } } }
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }]
  });

  return NextResponse.json({ posts });
}

// POST /api/posts — crée UNE publication (éventuellement multi-médias pour
// un carrousel), distribuée vers un ou plusieurs réseaux cibles. Envoyée
// immédiatement si publishNow=true et aucune scheduledAt, sinon programmée
// pour le worker planifié.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const userId = (session.user as { id: string }).id;

  // La marque doit être une des marques de l'utilisateur ; le reste des
  // règles (comptes et médias de la marque, quota, date) est appliqué par
  // createPost, partagé avec l'API publique (voir src/lib/posts/create-post.ts).
  const denied = await requireBrandMembership(userId, parsed.data.brandId);
  if (denied) return denied;

  const result = await createPost(userId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.reason ? { reason: result.reason } : {}) }, { status: result.status });
  }
  // "status" : uniquement pour que le Composer sache si la publication
  // immédiate a vraiment réussi (son de décollage, voir cosmic-audio.ts).
  return NextResponse.json({ ok: true, postId: result.postId, milestone: result.milestone, status: result.status });
}
