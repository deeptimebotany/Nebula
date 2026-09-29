import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled, generateFreeCaption } from "@/lib/ai/gemini";
import { requireToolAccess } from "@/lib/tools/access";
import { NETWORK_META, NETWORKS, type Network } from "@/lib/types";

// POST /api/public/tools/captions — générateur IA de titres/légendes de
// /outils/legendes. Depuis le 29/09/2026 : compte obligatoire (gratuit ou
// payant) et quota par compte (porte unique de l'IA, lib/ai/guard.ts) ; sans compte, la
// page montre une démo préparée à l'avance et n'appelle jamais cette route.

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

  const access = await requireToolAccess(req, "text");
  if (access instanceof NextResponse) return access;
  const { quota } = access;

  try {
    const text = await access.allowance.run(() =>
      generateFreeCaption({
        field,
        network,
        maxLength: network ? NETWORK_META[network as Network]?.maxCaption : undefined,
        brandName: brandName?.trim() || "un créateur de contenu",
        topic
      })
    );
    return NextResponse.json({ text, remaining: quota.remaining, limit: quota.limit });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
