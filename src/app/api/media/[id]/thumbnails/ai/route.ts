import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, generateThumbnail } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { saveUploadedFile } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  frameBase64: z.string(),
  frameMimeType: z.string(),
  title: z.string().optional(),
  network: z.string().optional(),
  // Brief de l'assistant « Demander à Nebula » (bouton « Générer cette
  // miniature ») — facultatif, voir generateThumbnail().
  brief: z.object({ hook: z.string().max(60), imagePrompt: z.string().max(1200) }).nullable().optional()
});

// POST /api/media/[id]/thumbnails/ai — à partir d'une frame réelle de la
// vidéo (capturée côté navigateur, voir composer/page.tsx), demande à
// Gemini de générer une variante plus accrocheuse de la miniature.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  const userId = (session.user as { id: string }).id;
  const asset = await prisma.mediaAsset.findFirst({ where: { id: params.id, brand: ownedBy(userId) } });
  if (!asset) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });

  const { limits } = await getBrandPlan(asset.brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json({ error: "La miniature générée par IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation.", reason: "ai_assistant" }, { status: 402 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { frameBase64, frameMimeType, title, network, brief } = parsed.data;

  try {
    const generated = await generateThumbnail({ frameBase64, frameMimeType, title: title ?? "", network, brief: brief ?? null });
    const buffer = Buffer.from(generated.base64, "base64");
    const ext = generated.mimeType.includes("png") ? "png" : "jpg";
    const file = new File([buffer], `ia-${asset.id}.${ext}`, { type: generated.mimeType });
    const saved = await saveUploadedFile(file);
    return NextResponse.json({ url: saved.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
