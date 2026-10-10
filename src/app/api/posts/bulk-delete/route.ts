import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { deletePostAndOrphanMedia } from "@/lib/posts/delete-post";
import { deleteTargetsOnNetworks, type RemoteDeleteResult } from "@/lib/posts/remote-delete";
import { instagramDeleteEnabled } from "@/lib/social/meta";
import { bulkDeletablePosts, bulkRemoteTargetIds, type BulkPost } from "@/lib/posts/bulk-delete";
import { NETWORKS } from "@/lib/types";

// POST /api/posts/bulk-delete { ids, alsoDeleteOn? } — page Publications
// (09/10/2026, demande de Lucas) : supprimer d'un coup les publications
// cochées. Seulement les publications des marques de la personne ; une
// publication en cours d'envoi (PUBLISHING) n'est pas touchée.
//
// 10/10/2026 : `alsoDeleteOn` (réseaux cochés dans la fenêtre) retire aussi
// des réseaux les publications qui y sont en ligne, quand le réseau le
// permet à Nebula (mêmes règles que la corbeille d'une seule publication,
// /api/posts/[id] DELETE). Si un réseau échoue pour une publication, elle
// reste dans Nebula (renvoyée dans `kept`, avec l'erreur) : rien n'est
// perdu de vue. Les réseaux qui ne le permettent pas (YouTube, TikTok…)
// gardent la publication en ligne, ce que la fenêtre annonce avant.
export const maxDuration = 300;

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
  alsoDeleteOn: z.array(z.enum(NETWORKS)).max(NETWORKS.length).optional()
});

/** Appels aux réseaux : quelques publications à la fois. */
const REMOTE_CONCURRENCY = 4;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const ids = Array.from(new Set(parsed.data.ids));
  const networks = parsed.data.alsoDeleteOn ?? [];

  const owned: (BulkPost & { title: string; caption: string })[] = await prisma.post.findMany({
    where: { id: { in: ids }, brand: ownedBy(userId) },
    select: {
      id: true,
      status: true,
      title: true,
      caption: true,
      targets: { select: { id: true, network: true, status: true, externalPostId: true, externalUrl: true, metadata: true, connection: { select: { scopes: true, status: true } } } }
    }
  });
  const deletable = bulkDeletablePosts(owned);
  const igDelete = instagramDeleteEnabled();

  // 1) Réseaux d'abord (quelques publications à la fois).
  const remote = new Map<string, RemoteDeleteResult[]>();
  if (networks.length > 0) {
    const queue = deletable.filter((p) => bulkRemoteTargetIds(p, networks, { instagramDeleteEnabled: igDelete }).length > 0);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const post = queue[next++];
        remote.set(post.id, await deleteTargetsOnNetworks(post.id, bulkRemoteTargetIds(post, networks, { instagramDeleteEnabled: igDelete })));
      }
    };
    await Promise.all(Array.from({ length: Math.min(REMOTE_CONCURRENCY, queue.length) }, worker));
  }

  // 2) Puis Nebula, une à une : un fichier partagé entre deux publications
  // cochées n'est effacé qu'avec la dernière (voir delete-post.ts).
  const removedOn: Record<string, number> = {};
  const kept: { id: string; title: string; failures: { network: string; error: string; manualUrl: string | null }[] }[] = [];
  let deleted = 0;
  for (const post of deletable) {
    const results = remote.get(post.id) ?? [];
    for (const r of results) if (r.ok) removedOn[r.network] = (removedOn[r.network] ?? 0) + 1;
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      kept.push({
        id: post.id,
        title: (post.title || post.caption || "Publication sans titre").slice(0, 80),
        failures: failures.map((f) => ({ network: f.network, error: f.error ?? "Suppression refusée par le réseau.", manualUrl: f.manualUrl ?? null }))
      });
      continue;
    }
    await deletePostAndOrphanMedia(post.id);
    deleted += 1;
  }

  return NextResponse.json({
    deleted,
    removedOn,
    kept,
    publishing: owned.length - deletable.length,
    notFound: ids.length - owned.length
  });
}
