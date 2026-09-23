import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, generateCopy } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { NETWORK_META, type Network } from "@/lib/types";
import { z } from "zod";

const bodySchema = z.object({
  brandId: z.string(),
  field: z.enum(["title", "description"]),
  network: z.string().optional(),
  existingTitle: z.string().optional(),
  existingCaption: z.string().optional(),
  mediaHint: z.string().optional(),
  frameBase64: z.string().optional(),
  frameMimeType: z.string().optional()
});

// POST /api/ai/generate-copy — génère un titre ou une description via
// Gemini, adapté aux contraintes de longueur du réseau ciblé.
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
  const { brandId, field, network, existingTitle, existingCaption, mediaHint, frameBase64, frameMimeType } = parsed.data;
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  const { limits } = await getBrandPlan(brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json({ error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation.", reason: "ai_assistant" }, { status: 402 });
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

  try {
    const text = await generateCopy({
      field,
      network,
      maxLength: network ? NETWORK_META[network as Network]?.maxCaption : undefined,
      brandName: brand.name,
      existingTitle,
      existingCaption,
      mediaHint,
      frameBase64,
      frameMimeType
    });
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
