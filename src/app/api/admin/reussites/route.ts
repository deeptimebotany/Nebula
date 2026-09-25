import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireOwnerUserId } from "@/lib/admin";
import { autoTarget, ensureCollective, monthTotals, setCollectiveTarget } from "@/lib/reussites/collective";
import { adminFeature, featuredAdminView, removeFeatured } from "@/lib/reussites/featured";
import { monthLabel } from "@/lib/reussites/catalog";
import { monthOf } from "@/lib/reussites/periods";

export const dynamic = "force-dynamic";

// /api/admin/reussites — propriétaire du site seulement (404 sinon) :
// défi collectif du mois (objectif) et vidéos à la une (lot C).
async function view() {
  const now = new Date();
  const period = monthOf(now);
  const previous = monthOf(new Date(period.start.getTime() - 86_400_000));
  const [row, totals, prev, featured] = await Promise.all([ensureCollective(period), monthTotals(period, { fresh: true }), monthTotals(previous), featuredAdminView(now)]);
  return {
    collective: {
      month: period.id,
      label: monthLabel(period.id),
      target: row.target,
      source: row.source,
      total: totals.total,
      participants: totals.participants,
      reachedAt: row.reachedAt ? new Date(row.reachedAt).toISOString() : null,
      previousTotal: prev.total,
      autoTarget: autoTarget(prev.total)
    },
    featured
  };
}

export async function GET() {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(await view(), { headers: { "Cache-Control": "no-store" } });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-target"), target: z.number().int().min(1).max(1_000_000) }),
  z.object({ action: z.literal("feature"), sharedVideoId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) })
]);

export async function POST(req: NextRequest) {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  if (parsed.data.action === "set-target") {
    await setCollectiveTarget(parsed.data.target);
  } else if (parsed.data.action === "feature") {
    const res = await adminFeature(parsed.data.sharedVideoId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  } else {
    const res = await removeFeatured(parsed.data.id, { userId: ownerId, admin: true });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  }
  return NextResponse.json({ ok: true, ...(await view()) });
}
