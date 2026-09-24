import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { adsAccessFor } from "@/lib/ads/access";
import { syncAdAccount } from "@/lib/ads/sync";
import { adAccountDb } from "@/lib/prisma-extra";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ads/sync { brandId } — « Actualiser » de l'onglet Publicité.
// Un compte synchronisé il y a moins de 2 minutes est laissé tel quel.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const body = (await req.json().catch(() => ({}))) as { brandId?: string };
  if (!body.brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  const access = await adsAccessFor(userId, body.brandId);
  if (!access) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  if (!access.allowed) return NextResponse.json({ error: "Le suivi publicitaire est inclus dans les formules Pro et Agence." }, { status: 403 });

  const accounts = await adAccountDb.findMany({ where: { brandId: body.brandId, status: { not: "EXPIRED" } } });
  const recent = Date.now() - 2 * 60_000;
  const todo = accounts.filter((a) => !a.lastSyncedAt || a.lastSyncedAt.getTime() < recent).slice(0, 10);
  const results = await Promise.allSettled(todo.map((a) => syncAdAccount(a)));
  const errors = results
    .map((r, i) => (r.status === "fulfilled" ? (r.value.ok ? null : `${todo[i].name} : ${r.value.error}`) : `${todo[i].name} : ${String(r.reason)}`))
    .filter(Boolean) as string[];
  return NextResponse.json({ synced: todo.length - errors.length, skipped: accounts.length - todo.length, errors });
}
