import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ownedBy } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/gemini";
import { gateAppAi } from "@/lib/ai/guard";
import { runWithAiContext } from "@/lib/ai/usage";
import { consumeRateLimit } from "@/lib/rate-limit";
import { analyzeVideoForCopy, copyAnalysisBrief } from "@/lib/ai/copy-analysis";

// POST /api/media/[id]/copy-analysis — « Rédiger avec l'IA » dans Publier
// (09/10/2026, demande de Lucas) : Gemini regarde la vidéo importée (image
// et son) et décrit son contenu, avant d'écrire le titre ou la description
// (voir src/lib/ai/copy-analysis.ts). Le navigateur garde le résumé tant que
// la vidéo ne change pas et le joint à chaque /api/ai/generate-copy.
//
// Quota : l'analyse elle-même n'est pas décomptée ; chaque texte écrit
// ensuite l'est (un texte IA, comme avant). Ici, on vérifie seulement qu'il
// reste au moins un texte (palier, âge, adresse, quota, budget), sans rien
// réserver. Une rafale d'analyses est bornée par compte (ANALYZE_LIMIT par
// heure) : chacune coûte l'équivalent de quelques centimes chez Google.
export const dynamic = "force-dynamic";
// Envoi de la vidéo chez Google, préparation, puis analyse : jusqu'à
// quelques minutes pour une longue vidéo.
export const maxDuration = 300;

const ANALYZE_LIMIT = 10;
const ANALYZE_WINDOW_MINUTES = 60;
/** Marge laissée avant la coupure de la fonction par Vercel. */
const DEADLINE_MS = 280_000;

const bodySchema = z.object({
  // Lue par le navigateur quand la base ne l'a pas (vidéo importée avant sa mesure).
  durationSeconds: z.number().positive().max(86_400).optional()
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const deadline = Date.now() + DEADLINE_MS;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isAiEnabled()) {
    return NextResponse.json({ error: "L'assistant IA n'est pas configuré sur cette instance (GEMINI_API_KEY manquant)." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  const asset = await prisma.mediaAsset.findFirst({ where: { id: params.id, brand: ownedBy(userId) } });
  if (!asset) return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
  if (asset.type !== "VIDEO") return NextResponse.json({ error: "Ce média n'est pas une vidéo." }, { status: 400 });

  // Vérification sans réservation : le texte sera décompté à sa rédaction.
  const gate = await gateAppAi({ userId, brandId: asset.brandId, kind: "text" });
  if (!gate.ok) return gate.response;
  await gate.allowance.release();

  const limit = await consumeRateLimit("copy-analyze", userId, ANALYZE_LIMIT, ANALYZE_WINDOW_MINUTES);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Vous avez fait analyser beaucoup de vidéos d'un coup : la prochaine analyse est possible dans ${Math.ceil(limit.retryAfterSeconds / 60)} min. Rien n'a été décompté.`,
        retryAfterSeconds: limit.retryAfterSeconds
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const durationSeconds = asset.durationSeconds ?? parsed.data.durationSeconds ?? null;
  try {
    // Contexte « texte » : les jetons de l'analyse comptent dans le coût des
    // textes sur /admin/ia, sans compter d'action à part.
    const analysis = await runWithAiContext({ plan: gate.allowance.plan, kind: "text", billed: false, model: null }, () =>
      analyzeVideoForCopy({ url: asset.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, filename: asset.filename }, { durationSeconds }, { deadline })
    );
    return NextResponse.json({ analysis, brief: copyAnalysisBrief(analysis) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "L'analyse de la vidéo a échoué." }, { status: 502 });
  }
}
