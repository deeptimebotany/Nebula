import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { voteFeedback } from "@/lib/community/feedback";

// POST { optionId } — vote pour une proposition (un vote par personne,
// modifiable tant que la demande est ouverte ; jamais sur la sienne). Tous
// les paliers, Gratuit compris (choix de Lucas, 02/10/2026).
const bodySchema = z.object({ optionId: z.string().min(1).max(64) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choisissez une proposition." }, { status: 400 });
  const rate = await consumeRateLimit("feedback-vote", userId, 120, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de votes d'un coup : réessayez dans un moment." }, { status: 429 });
  const result = await voteFeedback(userId, params.id, parsed.data.optionId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, request: result.request });
}
