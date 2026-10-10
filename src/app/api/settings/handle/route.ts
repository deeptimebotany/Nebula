import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { setHandle } from "@/lib/community/handle";

// PATCH { handle } — change le pseudo de la Communauté (10/10/2026).
// 5 changements par jour au plus : un pseudo sert à se reconnaître.
const bodySchema = z.object({ handle: z.string().min(1).max(40) });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choisissez un pseudo." }, { status: 400 });
  const rate = await consumeRateLimit("handle-change", userId, 5, 24 * 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de changements aujourd'hui : réessayez demain." }, { status: 429 });
  const result = await setHandle(userId, parsed.data.handle);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, handle: result.handle });
}
