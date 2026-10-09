import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { deletePostAndOrphanMedia } from "@/lib/posts/delete-post";

// POST /api/posts/bulk-delete { ids } — page Publications (09/10/2026,
// demande de Lucas) : supprimer d'un coup les publications cochées.
//
// Suppression dans Nebula seulement (comme DELETE /api/posts/[id] sans
// corps) : une publication déjà en ligne reste sur les réseaux ; pour la
// retirer aussi d'un réseau, la corbeille de sa ligne propose « Supprimer
// aussi sur … ». Seulement les publications des marques de la personne ;
// une publication en cours d'envoi (PUBLISHING) n'est pas touchée.
const bodySchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const ids = Array.from(new Set(parsed.data.ids));

  const owned: { id: string; status: string }[] = await prisma.post.findMany({
    where: { id: { in: ids }, brand: ownedBy(userId) },
    select: { id: true, status: true }
  });
  const deletable = owned.filter((p) => p.status !== "PUBLISHING");
  // Une à une : un fichier partagé entre deux publications cochées n'est
  // effacé qu'avec la dernière (voir delete-post.ts).
  for (const p of deletable) await deletePostAndOrphanMedia(p.id);

  return NextResponse.json({
    deleted: deletable.length,
    publishing: owned.length - deletable.length,
    notFound: ids.length - owned.length
  });
}
