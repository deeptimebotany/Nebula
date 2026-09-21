import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled, generateFreeCaption } from "@/lib/ai/gemini";
import { consumePublicQuota } from "@/lib/public-tools-limit";
import { NETWORK_META, NETWORKS, type Network } from "@/lib/types";

// POST /api/public/tools/captions — générateur IA gratuit de titres/légendes,
// SANS COMPTE (voir /outils/legendes). Contrairement à /api/ai/generate-copy
// (réservé aux comptes Pro/Agence, lié à une vraie publication), cette route
// n'a aucune notion de session ni de marque : seulement un plafond quotidien
// par IP (voir src/lib/public-tools-limit.ts) pour éviter l'abus, puisque
// c'est justement l'intérêt de l'outil de rester ouvert à tous.
const DAILY_LIMIT = 8;

const bodySchema = z.object({
  topic: z.string().min(3).max(400),
  network: z.enum(NETWORKS).optional(),
  brandName: z.string().max(60).optional(),
  field: z.enum(["title", "description"]).default("description")
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
    return NextResponse.json({ error: "Décrivez votre publication en quelques mots (3 caractères minimum)." }, { status: 400 });
  }
  const { topic, network, brandName, field } = parsed.data;

  const quota = await consumePublicQuota(req, "captions", DAILY_LIMIT);
  if (!quota.ok) {
    return NextResponse.json(
      { error: `Limite gratuite atteinte (${DAILY_LIMIT} générations/jour). Créez un compte Nebula gratuit pour un usage illimité.` },
      { status: 429 }
    );
  }

  try {
    const text = await generateFreeCaption({
      field,
      network,
      maxLength: network ? NETWORK_META[network as Network]?.maxCaption : undefined,
      brandName: brandName?.trim() || "un créateur de contenu",
      topic
    });
    return NextResponse.json({ text, remaining: quota.remaining, limit: quota.limit });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
