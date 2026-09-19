import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, chatComplete, type ChatMessage } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { z } from "zod";

const bodySchema = z.object({
  brandId: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string() })).min(1),
  // Contexte optionnel : limite le scope au post en cours si on discute
  // depuis la page /posts/[id] plutôt que de l'assistant global.
  postId: z.string().optional()
});

const SYSTEM_BASE = `Tu es l'assistant intégré de Nebula, une app de gestion de réseaux sociaux (planification, publication multi-réseaux, analytics). Tu aides l'utilisateur à utiliser le site (composer, calendrier, comptes, facturation) et à interpréter ses statistiques réelles fournies ci-dessous. Sois concret, concis, en français, et appuie-toi UNIQUEMENT sur les chiffres fournis dans le contexte — n'invente jamais de statistiques. Si une info manque, dis-le et explique comment l'obtenir dans l'app.`;

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
  const { brandId, messages, postId } = parsed.data;

  const { limits, plan } = await getBrandPlan(brandId);
  if (!limits.aiEnabled) {
    return NextResponse.json(
      { error: "L'assistant IA fait partie des paliers Pro/Agence. Passez à un palier supérieur dans Facturation." },
      { status: 402 }
    );
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      connections: { where: { status: "CONNECTED" }, include: { analytics: { orderBy: { capturedAt: "desc" }, take: 1 } } },
      posts: { orderBy: { createdAt: "desc" }, take: 5, include: { targets: true } }
    }
  });
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });

  const statsLines = brand.connections.map((c: (typeof brand.connections)[number]) => {
    const last = c.analytics[0];
    return `- ${c.network} (${c.displayName}) : ${last ? `${last.followers} abonnés, ${last.impressions} impressions, ${last.reach} portée (dernière synchro)` : "pas encore synchronisé"}`;
  });
  const recentPostsLines = brand.posts.map(
    (p: (typeof brand.posts)[number]) => `- "${p.title || p.caption.slice(0, 40) || "(sans titre)"}" — statut ${p.status}, ${p.targets.length} réseau(x) ciblé(s)`
  );

  let postContext = "";
  if (postId) {
    const post = await prisma.post.findUnique({ where: { id: postId }, include: { targets: true } });
    if (post) {
      postContext = `\n\nPublication actuellement discutée : titre="${post.title}", description="${post.caption}", statut=${post.status}, réseaux=${post.targets.map((t: (typeof post.targets)[number]) => t.network).join(", ")}.`;
    }
  }

  const systemInstruction = [
    SYSTEM_BASE,
    `Palier actuel de la marque "${brand.name}" : ${plan}.`,
    "Statistiques des comptes connectés :",
    statsLines.length ? statsLines.join("\n") : "(aucun compte connecté pour le moment)",
    "Dernières publications :",
    recentPostsLines.length ? recentPostsLines.join("\n") : "(aucune publication pour le moment)",
    postContext
  ].join("\n");

  try {
    const reply = await chatComplete(messages as ChatMessage[], systemInstruction);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
