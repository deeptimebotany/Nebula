import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/plan";
import { countReschedulable, rescheduleDormantPosts } from "@/lib/billing/free-limits";

// « Reprogrammer les n publications » (lot E4) : après le passage en Pro,
// les brouillons mis de côté à la fin de l'essai repartent à leur date
// d'origine si elle est encore à venir. Idempotent.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const info = await getUserPlan(userId);
  if (!info.paid && !info.comp) {
    return NextResponse.json({ error: "Les publications repartent dès le passage en Pro.", reason: "dormant_brand" }, { status: 402 });
  }
  const result = await rescheduleDormantPosts(userId);
  return NextResponse.json({ ok: true, ...result, remaining: await countReschedulable(userId) });
}
