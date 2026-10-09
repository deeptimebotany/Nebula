import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { listConversations } from "@/lib/ai/assistant-conversations";

export const dynamic = "force-dynamic";

// GET /api/ai/conversations?brandId=… — « Discussions » du chat (09/10/2026) :
// les conversations de la personne connectée pour cette marque.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  return NextResponse.json({ conversations: await listConversations(userId, brandId) });
}
