import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { isAiEnabled, pickBestFrames } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { z } from "zod";

const bodySchema = z.object({
  brandId: z.string(),
  count: z.number().int().min(1).max(12).default(3),
  frames: z
    .array(
      z.object({
        index: z.number().int(),
        base64: z.string(),
        mimeType: z.string()
      })
    )
    .min(1)
    .max(24)
});

// POST /api/ai/pick-best-frames — demande à Gemini de choisir, parmi
// plusieurs frames candidates extraites d'une même vidéo côté navigateur
// (voir onGenerateThumbnails dans composer/page.tsx), lesquelles feraient
// les meilleures miniatures (nettes, bien cadrées, sujet reconnaissable) —
// évite de proposer des frames de transition ou floues issues d'un simple
// échantillonnage à intervalles fixes.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { brandId, count, frames } = parsed.data;
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const { limits } = await getBrandPlan(brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json({ error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation.", reason: "ai_assistant" }, { status: 402 });
  }

  try {
    const picks = await pickBestFrames({ frames, count });
    // bestIndexes conservé pour compatibilité ; picks porte le « pourquoi ».
    return NextResponse.json({ bestIndexes: picks.map((p) => p.index), picks });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
