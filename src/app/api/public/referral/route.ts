import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { REFERRED_TRIAL_DAYS } from "@/lib/trial";

// GET /api/public/referral?code=XXXX — bandeau « Invité par {prénom} » de la
// page d'inscription (brief growth, lot G7). Ne révèle QUE le prénom du
// parrain (jamais son email ni son nom complet), et seulement si le code
// existe ; rate-limit pour empêcher l'énumération des codes.
export async function GET(req: NextRequest) {
  const rate = await consumeRateLimit("referral-lookup", clientIpFromHeaders(req.headers), 30, 10 * 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 });
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) return NextResponse.json({ found: false });
  const user = await prisma.user.findUnique({ where: { referralCode: code }, select: { name: true } });
  if (!user) return NextResponse.json({ found: false });
  const firstName = user.name.trim().split(/\s+/)[0] ?? "";
  return NextResponse.json({ found: true, firstName, trialDays: REFERRED_TRIAL_DAYS }, { headers: { "Cache-Control": "private, max-age=300" } });
}
