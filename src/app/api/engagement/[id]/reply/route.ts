import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { replyToEngagementItem } from "@/lib/engagement/reply";

// POST /api/engagement/[id]/reply { text } — répond au commentaire sur son
// réseau, au nom du compte (page Commentaires, 01/10/2026). Règles et
// messages : src/lib/engagement/reply.ts.
export const maxDuration = 60;

const bodySchema = z.object({ text: z.string().max(12000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const outcome = await replyToEngagementItem(userId, params.id, parsed.data.text);
  if (!outcome.ok) {
    const { status, ...rest } = outcome;
    return NextResponse.json(rest, { status });
  }
  return NextResponse.json(outcome);
}
