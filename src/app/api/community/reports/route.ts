import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { REPORT_DETAILS_MAX, REPORT_REASON_IDS, REPORT_TARGET_TYPES, reportContent } from "@/lib/community/moderation";

// POST /api/community/reports — « Signaler » un sujet, une réponse ou un
// lien partagé de la Communauté (30/09/2026, voir lib/community/moderation.ts).
// Un seul signalement par personne et par contenu ; 20 par heure au plus.
const bodySchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASON_IDS),
  details: z.string().max(REPORT_DETAILS_MAX * 2).optional().nullable()
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choisissez un motif de signalement." }, { status: 400 });

  const rate = await consumeRateLimit("community-report", userId, 20, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de signalements d'un coup : réessayez dans un moment." }, { status: 429 });

  const result = await reportContent({ reporterId: userId, type: parsed.data.targetType, id: parsed.data.targetId, reason: parsed.data.reason, details: parsed.data.details });
  if (!result.ok) return NextResponse.json({ error: result.error, already: result.already ?? false }, { status: result.status });
  return NextResponse.json({ ok: true });
}
