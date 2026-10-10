import { refreshReussites } from "@/lib/reussites/engine";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { FORUM_REPLY_MAX, postReply } from "@/lib/community/forum";

// POST { body, parentId? } — répond au sujet, ou à une réponse (10/10/2026 :
// fil façon YouTube, un seul niveau ; voir src/lib/community/forum.ts).
const bodySchema = z.object({ body: z.string().max(FORUM_REPLY_MAX * 2), parentId: z.string().min(1).max(64).nullish() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message vide." }, { status: 400 });
  const rate = await consumeRateLimit("forum-reply", userId, 30, 10);
  if (!rate.ok) return NextResponse.json({ error: "Beaucoup de réponses d'un coup : réessayez dans quelques minutes." }, { status: 429 });

  const result = await postReply(userId, params.id, parsed.data.body, parsed.data.parentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  // Réussites : « Voix de la communauté » et le défi « Aider quelqu'un ».
  await refreshReussites(userId);
  return NextResponse.json({ ok: true, reply: result.reply });
}
