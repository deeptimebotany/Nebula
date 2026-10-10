import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { likeEngagementItem } from "@/lib/engagement/actions";

// POST /api/engagement/[id]/like { like } — met ou retire le j'aime du compte
// sur un commentaire reçu (Facebook, Bluesky ; 10/10/2026). Règles et
// messages : src/lib/engagement/actions.ts.
export const maxDuration = 30;

const bodySchema = z.object({ like: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const outcome = await likeEngagementItem((session.user as { id: string }).id, params.id, parsed.data.like);
  if (!outcome.ok) {
    const { status, ...rest } = outcome;
    return NextResponse.json(rest, { status });
  }
  return NextResponse.json(outcome);
}
