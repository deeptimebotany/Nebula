import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { suggestMembers } from "@/lib/community/mentions";

// GET /api/community/members?q=lea — membres dont le pseudo commence par
// « lea » (suggestions quand on tape « @ » dans la Communauté, 10/10/2026).
// Seulement le pseudo, la photo et le rang : jamais le nom ni l'e-mail.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const rate = await consumeRateLimit("member-suggest", userId, 300, 10);
  if (!rate.ok) return NextResponse.json({ members: [] });
  const members = await suggestMembers(userId, req.nextUrl.searchParams.get("q") ?? "");
  return NextResponse.json({ members });
}
