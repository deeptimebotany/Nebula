import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled, generateThumbnail } from "@/lib/ai/gemini";
import { consumePublicQuota } from "@/lib/public-tools-limit";

// POST /api/public/tools/thumbnail — générateur IA gratuit de miniatures,
// SANS COMPTE (voir /outils/miniatures). Réutilise directement
// generateThumbnail() de src/lib/ai/gemini.ts (déjà utilisée dans le
// Composer pour les comptes payants) : le visiteur envoie une photo qu'il a
// déjà (lue en base64 côté navigateur, jamais stockée côté serveur), Gemini
// la rend plus "punchy". Plafond quotidien par IP plus bas que les légendes
// (voir DAILY_LIMIT) car la génération d'image coûte davantage.
const DAILY_LIMIT = 3;
const MAX_BASE64_LENGTH = 8_000_000; // ~6 Mo décodé, large marge pour une photo compressée côté navigateur

const bodySchema = z.object({
  imageBase64: z.string().min(100).max(MAX_BASE64_LENGTH),
  imageMimeType: z.string().startsWith("image/"),
  title: z.string().max(100).optional(),
  network: z.string().max(20).optional()
});

export async function POST(req: NextRequest) {
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "Le générateur IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." },
      { status: 503 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Photo invalide ou manquante." }, { status: 400 });
  }
  const { imageBase64, imageMimeType, title, network } = parsed.data;

  const quota = await consumePublicQuota(req, "thumbnail", DAILY_LIMIT);
  if (!quota.ok) {
    return NextResponse.json(
      { error: `Limite gratuite atteinte (${DAILY_LIMIT} miniatures/jour). Créez un compte Nebula gratuit pour un usage illimité.` },
      { status: 429 }
    );
  }

  try {
    const result = await generateThumbnail({
      frameBase64: imageBase64,
      frameMimeType: imageMimeType,
      title: title?.trim() || "",
      network
    });
    return NextResponse.json({
      imageBase64: result.base64,
      imageMimeType: result.mimeType,
      remaining: quota.remaining,
      limit: quota.limit
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
