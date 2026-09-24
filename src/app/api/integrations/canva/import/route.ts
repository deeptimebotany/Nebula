import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { freshIntegrationToken } from "@/lib/integrations/oauth-accounts";
import { getCanvaExport, refreshCanvaToken } from "@/lib/integrations/canva";
import { ALLOWED_HOSTS, ImportError, fetchFromAllowedHost, storeDownloadedMedia } from "@/lib/integrations/remote-media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  brandId: z.string().min(1),
  jobId: z.string().min(3).max(100),
  title: z.string().max(200).optional(),
  kind: z.enum(["image", "video"])
});

// POST /api/integrations/canva/import — vérifie l'export lancé par
// /export ; tant qu'il tourne, renvoie { status: "pending" } (le navigateur
// réessaie) ; une fois prêt, enregistre le fichier comme média de la marque.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const denied = await requireBrandMembership(userId, parsed.data.brandId);
  if (denied) return denied;

  try {
    const token = await freshIntegrationToken(userId, "canva", refreshCanvaToken);
    const job = await getCanvaExport(token, parsed.data.jobId);
    if (job.status === "in_progress") return NextResponse.json({ status: "pending" });
    if (job.status === "failed" || job.urls.length === 0) throw new ImportError(job.error || "Canva n'a pas pu exporter ce design.", 502);
    const res = await fetchFromAllowedHost(job.urls[0], ALLOWED_HOSTS.canva);
    const base = (parsed.data.title || "design-canva").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "design-canva";
    const asset = await storeDownloadedMedia(parsed.data.brandId, res, `${base}.${parsed.data.kind === "video" ? "mp4" : "png"}`, parsed.data.kind === "video" ? "video/mp4" : "image/png");
    return NextResponse.json({ status: "done", asset });
  } catch (err) {
    const status = err instanceof ImportError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ImportError ? err.message : "Import Canva impossible pour le moment." }, { status });
  }
}
