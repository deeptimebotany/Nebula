import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerUserId } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { apiWatchDashboard } from "@/lib/api-watch/dashboard";
import { runApiWatch } from "@/lib/api-watch/watcher";

// /api/admin/api-watch — veille des API (02/10/2026), compte propriétaire
// uniquement (404 sinon, comme les autres pages d'administration).
//   GET  → calendrier, annonces, signaux, sources
//   POST { action: "handle", type: "signal" | "item", id, handled } → marquer traité
//   POST { action: "check-now" } → échéances + les 6 sources relues le moins récemment
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(await apiWatchDashboard());
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("handle"), type: z.enum(["signal", "item"]), id: z.string().min(1).max(40), handled: z.boolean() }),
  z.object({ action: z.literal("check-now") })
]);

export async function POST(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  if (parsed.data.action === "check-now") {
    const run = await runApiWatch(new Date(), { force: true, sources: 6 });
    return NextResponse.json({ ok: true, run, dashboard: await apiWatchDashboard() });
  }
  const { type, id, handled } = parsed.data;
  const data = { handledAt: handled ? new Date() : null };
  const res = type === "signal" ? await prisma.apiSignal.updateMany({ where: { id }, data }) : await prisma.apiWatchItem.updateMany({ where: { id }, data });
  if (res.count === 0) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
