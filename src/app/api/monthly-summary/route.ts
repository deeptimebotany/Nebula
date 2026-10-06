import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { availableMonths, loadMonthlySummary } from "@/lib/monthly-summary/data";
import { isMonthKey, monthKeyOf, previousMonth } from "@/lib/monthly-summary/period";
import { SEND_TZ } from "@/lib/monthly-summary/period-window";

// GET /api/monthly-summary?brandId=…&month=2026-09 — page « Bilan du mois »
// d'Analytics (03/10/2026) : le même bilan que l'e-mail, pour une marque dont
// on est membre, et les mois disponibles (12 au plus, mois en cours compris).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  const current = monthKeyOf(new Date(), SEND_TZ);
  const months = await availableMonths(brandId, current);
  const asked = req.nextUrl.searchParams.get("month");
  const month = isMonthKey(asked) && asked <= current ? asked : months.includes(previousMonth(current)) ? previousMonth(current) : months[0] ?? previousMonth(current);
  const data = await loadMonthlySummary(brandId, month, { userId, withReussites: true });
  if (!data) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
  return NextResponse.json({ data, months, current, inProgress: month === current });
}
