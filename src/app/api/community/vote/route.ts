import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { voteForum } from "@/lib/community/forum";
import { refreshReussites } from "@/lib/reussites/engine";

// POST { threadId | replyId, value: "like" | "dislike" | null } — j'aime ou
// je n'aime pas sur un sujet ou une réponse du forum (10/10/2026) ; null
// retire le vote. Le nombre de je n'aime pas n'est jamais renvoyé.
const bodySchema = z
  .object({
    threadId: z.string().min(1).max(64).nullish(),
    replyId: z.string().min(1).max(64).nullish(),
    value: z.enum(["like", "dislike"]).nullable()
  })
  .refine((v) => Boolean(v.threadId) !== Boolean(v.replyId), { message: "Précisez le sujet ou la réponse." });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vote invalide." }, { status: 400 });
  const rate = await consumeRateLimit("forum-vote", userId, 120, 10);
  if (!rate.ok) return NextResponse.json({ error: "Trop de votes d'un coup : réessayez dans un moment." }, { status: 429 });
  const result = await voteForum(userId, { threadId: parsed.data.threadId, replyId: parsed.data.replyId }, parsed.data.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  // Réussites : « Apprécié », étoiles Communauté (les je n'aime pas ne comptent pas).
  if (parsed.data.value === "like" && result.recipientId !== userId) await refreshReussites(result.recipientId);
  return NextResponse.json({ ok: true, likes: result.likes, myVote: result.myVote });
}
