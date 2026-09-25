import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { NETWORKS, type Network } from "@/lib/types";
import { loadStudioFacts } from "@/lib/studio/load";
import { generateStudio, studioHistory, studioQuota } from "@/lib/studio/generate";
import type { StudioPageDTO } from "@/lib/studio/types";

// Studio IA (produit n°9, page /studio).
//  GET  ?brandId=… : faits « ce qui marche chez vous » (sans IA, visibles
//       aussi en Gratuit), quota du jour, historique.
//  POST { brandId, kind, input } : une génération (idées + accroches, ou
//       script), réservée aux paliers Pro et Agence (402 « studio » sinon).
// Gemini peut mettre jusqu'à ~55 s : même groupe de fonctions que les
// autres routes à 60 s.
export const maxDuration = 60;

async function sessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const [facts, plan, history] = await Promise.all([loadStudioFacts(brandId), getBrandPlan(brandId), studioHistory(brandId)]);
  const body: StudioPageDTO = { facts, quota: await studioQuota(userId, plan), history };
  return NextResponse.json(body);
}

const network = z
  .string()
  .nullish()
  .transform((v) => (v && (NETWORKS as readonly string[]).includes(v) ? (v as Network) : null));

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ brandId: z.string().min(1), kind: z.literal("ideas"), input: z.object({ network, theme: z.string().trim().max(200).default("") }) }),
  z.object({
    brandId: z.string().min(1),
    kind: z.literal("script"),
    input: z.object({
      subject: z.string().trim().min(3, "Décrivez le sujet de la vidéo en quelques mots.").max(400),
      format: z.enum(["court", "long"]),
      network,
      fromIdea: z.object({ generationId: z.string().max(40), index: z.number().int().min(0).max(10) }).nullish()
    })
  })
]);

export async function POST(req: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const subject = parsed.error.issues.find((i) => i.path.includes("subject"));
    return NextResponse.json({ error: subject?.message ?? "Demande invalide." }, { status: 400 });
  }
  const { brandId, kind, input } = parsed.data;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const brand = (await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })) as { name: string } | null;
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

  const result = await generateStudio({ userId, brandId, brandName: brand.name, kind, input });
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.reason ? { reason: result.reason } : {}) }, { status: result.status });
  return NextResponse.json({ generation: result.generation, quota: result.quota });
}
