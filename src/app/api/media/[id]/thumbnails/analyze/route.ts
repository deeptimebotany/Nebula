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
import { analyzeVideoForThumbnails } from "@/lib/ai/thumbnail-analysis";

// POST /api/media/[id]/thumbnails/analyze — miniatures « en un clic »
// (07/10/2026), étape 1 sur 2 : Gemini regarde la vidéo importée dans
// Publier (image et son) et propose 3 concepts de miniature, chacun ancré
// sur un instant de la vidéo, avec l'accroche et le « pourquoi » du taux de
// clic (voir src/lib/ai/thumbnail-analysis.ts). Étape 2 : le navigateur
// extrait l'image de chaque instant et fait générer chaque miniature par
// /api/media/[id]/thumbnails/ai.
//
// Quota (choix de Lucas, 07/10/2026) : 3 miniatures par clic. L'analyse
// elle-même n'est pas décomptée : seules les miniatures réussies le sont, à
// l'étape 2 (une par image). Ici, on vérifie seulement qu'il en reste au
// moins une (palier, âge, adresse, quota, budget), sans rien réserver, et on
// renvoie combien de miniatures peuvent encore être créées (3 au plus).
// Une rafale d'analyses est bornée par compte (ANALYZE_LIMIT par heure) :
// chacune coûte l'équivalent de quelques centimes chez Google.
export const dynamic = "force-dynamic";
// Envoi de la vidéo chez Google, préparation, puis analyse : jusqu'à
// quelques minutes pour une longue vidéo.
export const maxDuration = 300;

const ANALYZE_LIMIT = 10;
const ANALYZE_WINDOW_MINUTES = 60;
/** Marge laissée avant la coupure de la fonction par Vercel. */
const DEADLINE_MS = 280_000;

const bodySchema = z.object({
  title: z.string().max(500).optional(),
  caption: z.string().max(5_000).optional(),
  networks: z.array(z.string().max(20)).max(10).optional(),
  // Lus par le navigateur quand la base ne les a pas (vidéo importée avant
  // leur mesure) : durée et format de la vidéo.
  durationSeconds: z.number().positive().max(86_400).optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional()
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

  // Vérification sans réservation : la réservation d'une miniature est
  // rendue aussitôt (elle sera décomptée à la génération de chaque image).
  const gate = await gateAppAi({ userId, brandId: asset.brandId, kind: "image" });
  if (!gate.ok) return gate.response;
  const remaining = gate.allowance.remaining;
  await gate.allowance.release();
  const imagesAllowed = remaining === null ? 3 : Math.min(3, remaining + 1);

  const limit = await consumeRateLimit("thumb-analyze", userId, ANALYZE_LIMIT, ANALYZE_WINDOW_MINUTES);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Vous avez lancé beaucoup d'analyses de vidéo d'un coup : la prochaine est possible dans ${Math.ceil(limit.retryAfterSeconds / 60)} min. Rien n'a été décompté.`,
        retryAfterSeconds: limit.retryAfterSeconds
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { title, caption, networks } = parsed.data;
  const width = asset.width ?? parsed.data.width ?? null;
  const height = asset.height ?? parsed.data.height ?? null;
  const durationSeconds = asset.durationSeconds ?? parsed.data.durationSeconds ?? null;

  try {
    // Contexte « image » : les jetons de l'analyse comptent dans le coût des
    // miniatures sur /admin/ia, sans compter d'action à part.
    const analysis = await runWithAiContext({ plan: gate.allowance.plan, kind: "image", billed: false, model: null }, () =>
      analyzeVideoForThumbnails(
        { url: asset.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, filename: asset.filename },
        { title, caption, networks, durationSeconds, orientation: width && height ? (height > width ? "vertical" : "horizontal") : null },
        { deadline }
      )
    );
    return NextResponse.json({ ...analysis, imagesAllowed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "L'analyse de la vidéo a échoué." }, { status: 502 });
  }
}
