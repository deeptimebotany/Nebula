import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAiEnabled, chatComplete } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { ownedBy } from "@/lib/brand-access";
import { z } from "zod";

// Le post doit appartenir à une des marques de l'utilisateur (sinon 404,
// comme s'il n'existait pas) — voir posts/[id]/route.ts pour le même schéma.
async function findOwnPost(userId: string, postId: string) {
  return prisma.post.findFirst({ where: { id: postId, brand: ownedBy(userId) }, select: { id: true, brandId: true } });
}

// GET /api/posts/[id]/messages — fil de discussion (IA) attaché à un post.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const own = await findOwnPost(userId, params.id);
  if (!own) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });

  const messages = await prisma.postMessage.findMany({
    where: { postId: own.id },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json({ messages });
}

const bodySchema = z.object({ content: z.string().min(1) });

// POST /api/posts/[id]/messages — ajoute un message utilisateur et, si l'IA
// est disponible pour cette marque, génère immédiatement la réponse de
// l'assistant avec le contexte réel du post (titre, description, statuts,
// dernières stats).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const userId = (session.user as { id: string }).id;

  // Appartenance vérifiée AVANT d'écrire quoi que ce soit (l'ancienne version
  // créait le message d'abord, sur n'importe quel post).
  const own = await findOwnPost(userId, params.id);
  if (!own) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });

  const userMessage = await prisma.postMessage.create({
    data: { postId: own.id, role: "USER", authorId: userId, content: parsed.data.content }
  });

  const post = await prisma.post.findUnique({
    where: { id: own.id },
    include: {
      targets: {
        include: {
          // Seules les dernières stats sont utiles au prompt — jamais les jetons.
          connection: { select: { analytics: { orderBy: { capturedAt: "desc" }, take: 1 } } }
        }
      }
    }
  });

  if (!post) return NextResponse.json({ userMessage, assistantMessage: null });

  const { limits } = await getBrandPlan(post.brandId);
  if (!isAiEnabled() || !limits.aiEnabled) {
    return NextResponse.json({ userMessage, assistantMessage: null });
  }

  const history = await prisma.postMessage.findMany({ where: { postId: params.id }, orderBy: { createdAt: "asc" } });

  const statsLines = post.targets.map((t: (typeof post.targets)[number]) => {
    const last = t.connection.analytics[0];
    return `- ${t.network} : statut ${t.status}${t.externalUrl ? `, publié (${t.externalUrl})` : ""}${last ? `, compte à ${last.followers} abonnés` : ""}`;
  });

  const systemInstruction = [
    "Tu es l'assistant IA de Nebula, intégré au fil de discussion d'UNE publication précise.",
    `Titre : ${post.title || "(sans titre)"}`,
    `Description : ${post.caption || "(vide)"}`,
    `Statut global : ${post.status}`,
    "Statuts par réseau :",
    statsLines.join("\n") || "(aucun réseau ciblé)",
    "Réponds en français, de façon concise et actionnable, en te basant UNIQUEMENT sur ces informations réelles."
  ].join("\n");

  try {
    const reply = await chatComplete(
      history.map((m: (typeof history)[number]) => ({ role: m.role === "USER" ? "user" : "model", text: m.content })),
      systemInstruction
    );
    const assistantMessage = await prisma.postMessage.create({
      data: { postId: params.id, role: "ASSISTANT", content: reply }
    });
    return NextResponse.json({ userMessage, assistantMessage });
  } catch (err) {
    const assistantMessage = await prisma.postMessage.create({
      data: { postId: params.id, role: "ASSISTANT", content: `⚠️ ${(err as Error).message}` }
    });
    return NextResponse.json({ userMessage, assistantMessage });
  }
}
