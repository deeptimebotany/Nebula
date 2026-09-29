import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled, pickBestFrames } from "@/lib/ai/gemini";
import { requireToolAccess } from "@/lib/tools/access";

// POST /api/public/tools/pick-frames — outil /outils/miniatures (29/09/2026),
// même fonctionnement que la section Miniature de la page Publier : le
// navigateur extrait 12 images de la vidéo (la vidéo n'est jamais envoyée),
// l'IA choisit les 3 meilleures (netteté, cadrage, potentiel de clic) et
// explique chaque choix. Compte obligatoire ; compte dans le quota « textes »
// de l'outil (voir lib/tools/quota.ts). Images jamais enregistrées.

// ~350 Ko par image (1 280 px de large en JPEG, en base64), 12 images au plus :
// reste sous la limite de 4,5 Mo par requête de Vercel.
const MAX_FRAME_BASE64 = 350_000;

const bodySchema = z.object({
  frames: z
    .array(
      z.object({
        index: z.number().int().min(0).max(23),
        base64: z.string().min(100).max(MAX_FRAME_BASE64),
        mimeType: z.literal("image/jpeg")
      })
    )
    .min(3)
    .max(12)
});

export async function POST(req: NextRequest) {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: "Le choix par l'IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Images invalides : relancez l'extraction depuis votre vidéo." }, { status: 400 });
  }

  const access = await requireToolAccess(req, "text");
  if (access instanceof NextResponse) return access;

  try {
    const picks = await access.allowance.run(() => pickBestFrames({ frames: parsed.data.frames, count: 3 }));
    const known = new Set(parsed.data.frames.map((f) => f.index));
    return NextResponse.json({
      picks: picks.filter((p) => known.has(p.index)).slice(0, 3),
      remaining: access.quota.remaining,
      limit: access.quota.limit
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
