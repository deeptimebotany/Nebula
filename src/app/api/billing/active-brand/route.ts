import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/billing/plan";
import { PLAN_LIMITS } from "@/lib/plans";
import { ACTIVE_BRAND_CHANGE_DAYS, brandActivity, chooseActiveBrand, pickConnectionsToKeep, resolveActiveBrand } from "@/lib/billing/free-limits";
import { trackGrowth } from "@/lib/growth";

// Écran « Choisir ce que je garde » (lot E4, brief « Essai 14 jours »).
// GET : les marques du compte (comptes connectés, publications programmées,
// dernière activité), la marque active retenue et, pour elle, les comptes
// gardés dans la limite du Gratuit. POST : enregistre le choix — libre
// pendant l'essai, une fois tous les 30 jours en Gratuit (les deux marques
// échangent alors leurs états, voir chooseActiveBrand).
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const [info, user, brands] = await Promise.all([
    getUserPlan(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { freeActiveBrandId: true, freeActiveConnectionIds: true, activeBrandChangedAt: true, trialEndsAt: true } }),
    brandActivity(userId)
  ]);
  const active = resolveActiveBrand(brands, user?.freeActiveBrandId);
  const chosen = Array.isArray(user?.freeActiveConnectionIds) ? (user!.freeActiveConnectionIds as unknown[]).filter((v): v is string => typeof v === "string") : null;
  const free = PLAN_LIMITS.FREE;
  const keptConnections = active ? Array.from(pickConnectionsToKeep(active.connections, free.maxConnections, chosen)) : [];
  const changeableAt =
    !info.onTrial && !info.paid && user?.activeBrandChangedAt ? new Date(user.activeBrandChangedAt.getTime() + ACTIVE_BRAND_CHANGE_DAYS * 86_400_000).toISOString() : null;
  return NextResponse.json(
    {
      plan: info.plan,
      onTrial: info.onTrial,
      paid: info.paid || Boolean(info.comp),
      trialEndsAt: user?.trialEndsAt ? user.trialEndsAt.toISOString() : null,
      chosenBrandId: user?.freeActiveBrandId ?? null,
      activeBrandId: active?.id ?? null,
      keptConnectionIds: keptConnections,
      changeableAt,
      freeLimits: { maxBrands: free.tiers[0].maxBrands, maxConnections: free.maxConnections },
      brands: brands.map((b) => ({
        id: b.id,
        name: b.name,
        dormant: Boolean(b.dormantAt),
        uses: b.uses,
        scheduledPosts: b.scheduledPosts,
        lastActivityAt: b.lastActivityAt ? b.lastActivityAt.toISOString() : null,
        connections: b.connections.map((c) => ({ id: c.id, network: c.network, displayName: c.displayName, dormant: Boolean(c.dormantAt), uses: c.uses }))
      }))
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const bodySchema = z.object({ brandId: z.string().min(1), connectionIds: z.array(z.string().min(1)).max(50).nullable().optional() });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choix invalide." }, { status: 400 });
  const result = await chooseActiveBrand(userId, parsed.data.brandId, parsed.data.connectionIds ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error, changeableAt: result.changeableAt ?? null }, { status: result.status });
  await trackGrowth("active_brand_chosen", { swap: Boolean(result.applied) }, userId).catch(() => undefined);
  return NextResponse.json({ ok: true, activeBrandId: result.activeBrandId, drafted: result.applied?.drafted ?? 0 });
}
