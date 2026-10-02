import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { recordFounderEndChoice } from "@/lib/billing/founders";

// POST /api/billing/founder-end — réponse à « quel forfait vous faut-il ? »
// à la fin de l'année Fondateur Premium (FounderEndModal) : la question ne
// revient plus. Le choix d'un forfait payant passe ensuite par
// /api/billing/checkout, comme d'habitude.
const bodySchema = z.object({ choice: z.enum(["free", "PRO-1", "PRO-5", "PRO-10", "AGENCY", "later"]) });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choix invalide." }, { status: 400 });
  // « Plus tard » : la question revient à la prochaine session.
  if (parsed.data.choice === "later") return NextResponse.json({ ok: true, recorded: false });
  const recorded = await recordFounderEndChoice(userId, parsed.data.choice);
  return NextResponse.json({ ok: true, recorded });
}
