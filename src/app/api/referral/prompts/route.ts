import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trackGrowth } from "@/lib/growth";

// POST /api/referral/prompts { key } — marque une invitation de parrainage
// contextuelle comme vue (User.referralPromptsSeen, brief growth lot G7) :
// chaque déclencheur ne s'affiche qu'une seule fois.
const KEYS = ["first_multi_network", "first_report_sent", "followers_1000", "followers_10000"] as const;
const bodySchema = z.object({ key: z.enum(KEYS) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Clé inconnue." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralPromptsSeen: true } });
  const seen = Array.isArray(user?.referralPromptsSeen) ? (user!.referralPromptsSeen as string[]) : [];
  if (!seen.includes(parsed.data.key)) {
    await prisma.user.update({ where: { id: userId }, data: { referralPromptsSeen: [...seen, parsed.data.key] } });
    await trackGrowth("referral_prompt_shown", { key: parsed.data.key }, userId);
  }
  return NextResponse.json({ ok: true, seen: [...new Set([...seen, parsed.data.key])] });
}
