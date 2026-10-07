import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, repurposeContent } from "@/lib/ai/gemini";
import { gateAppAi } from "@/lib/ai/guard";
import { z } from "zod";

// Durée maximale de la fonction Vercel (07/10/2026) : l'appel à Gemini est
// borné à 55 s, relances comprises (src/lib/ai/gemini.ts). Sans ce réglage,
// la fonction dépendait du défaut du projet Vercel.
export const maxDuration = 60;

const bodySchema = z.object({
  brandId: z.string(),
  sourceTitle: z.string().optional().default(""),
  sourceCaption: z.string().optional().default("")
});

// POST /api/ai/repurpose — "Recyclage de contenu automatisé" du Composer :
// génère 3 déclinaisons texte (Reel Instagram, post Facebook, script
// TikTok) à partir du titre/texte déjà rédigé (typiquement une vidéo
// YouTube). Ne génère aucun média, uniquement du texte.
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
  const { brandId, sourceTitle, sourceCaption } = parsed.data;
  const denied = await requireBrandMembership((session.user as { id: string }).id, brandId);
  if (denied) return denied;

  if (!sourceTitle.trim() && !sourceCaption.trim()) {
    return NextResponse.json({ error: "Rédigez d'abord un titre ou une description à recycler." }, { status: 400 });
  }

  const gate = await gateAppAi({ userId: (session.user as { id: string }).id, brandId, kind: "text" });
  if (!gate.ok) return gate.response;

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

  try {
    const result = await gate.allowance.run(() => repurposeContent({ brandName: brand.name, sourceTitle, sourceCaption }));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
