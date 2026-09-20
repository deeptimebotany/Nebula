import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyPremiumInfo } from "@/lib/premium-server";
import { z } from "zod";

const bodySchema = z.object({ optionId: z.string() });

// POST /api/community/polls/[id]/vote — vote réservé aux membres Premium
// actifs (droit de vote sur les futurs sujets, voir le brief produit) : un
// seul vote par utilisateur et par sondage (contrainte unique PollVote,
// revoter avec une autre option remplace le vote précédent).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const premium = await getMyPremiumInfo(userId);
  if (!premium.isPremium) {
    return NextResponse.json(
      { error: "Le vote sur les sondages est réservé aux membres Premium (Pro/Agence)." },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { optionId } = parsed.data;

  const option = await prisma.pollOption.findUnique({ where: { id: optionId } });
  if (!option || option.pollId !== params.id) {
    return NextResponse.json({ error: "Option invalide pour ce sondage." }, { status: 400 });
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: params.id, userId } },
    update: { optionId },
    create: { pollId: params.id, optionId, userId }
  });

  return NextResponse.json({ ok: true });
}
