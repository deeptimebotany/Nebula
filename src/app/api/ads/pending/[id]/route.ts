import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { adsAccessFor } from "@/lib/ads/access";
import { AD_PLATFORM_META, type AdAccountChoice, type AdPlatform } from "@/lib/ads/types";
import { adAccountDb, pendingAdAuthDb } from "@/lib/prisma-extra";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  const userId = (session.user as { id: string }).id;
  const pending = await pendingAdAuthDb.findUnique({ where: { id } });
  if (!pending || pending.userId !== userId || Date.now() - pending.createdAt.getTime() > 3_600_000) {
    return { error: NextResponse.json({ error: "Cette connexion a expiré : relancez-la." }, { status: 404 }) };
  }
  const access = await adsAccessFor(userId, pending.brandId);
  if (!access?.canManage) return { error: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  let accounts: AdAccountChoice[] = [];
  try {
    accounts = JSON.parse(pending.accounts) as AdAccountChoice[];
  } catch {
    accounts = [];
  }
  return { pending, access, accounts };
}

// GET : comptes trouvés, déjà suivis ou non, et places restantes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ("error" in r) return r.error;
  const existing = await adAccountDb.findMany({ where: { brandId: r.pending.brandId } });
  const tracked = new Set(existing.filter((a) => a.platform === r.pending.platform).map((a) => a.externalId));
  return NextResponse.json({
    platform: r.pending.platform,
    label: AD_PLATFORM_META[r.pending.platform as AdPlatform]?.label ?? r.pending.platform,
    brandId: r.pending.brandId,
    slotsLeft: Math.max(0, r.access.maxAccounts - existing.length),
    maxAccounts: r.access.maxAccounts,
    accounts: r.accounts.map((a) => ({ externalId: a.externalId, name: a.name, currency: a.currency, tracked: tracked.has(a.externalId) }))
  });
}

// POST { externalIds } : suit les comptes choisis. Un compte déjà suivi
// reçoit simplement le nouveau jeton (c'est la « reconnexion »).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => ({}))) as { externalIds?: unknown };
  const wanted = new Set(Array.isArray(body.externalIds) ? body.externalIds.filter((x): x is string => typeof x === "string") : []);
  const chosen = r.accounts.filter((a) => wanted.has(a.externalId));
  if (chosen.length === 0) return NextResponse.json({ error: "Choisissez au moins un compte." }, { status: 400 });

  const { pending } = r;
  const existing = await adAccountDb.findMany({ where: { brandId: pending.brandId } });
  const trackedIds = new Set(existing.filter((a) => a.platform === pending.platform).map((a) => a.externalId));
  const newOnes = chosen.filter((a) => !trackedIds.has(a.externalId));
  if (existing.length + newOnes.length > r.access.maxAccounts) {
    return NextResponse.json(
      { error: `Votre formule permet ${r.access.maxAccounts} comptes publicitaires par marque (${Math.max(0, r.access.maxAccounts - existing.length)} place(s) restante(s)).` },
      { status: 403 }
    );
  }

  const tokenData = {
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    tokenExpiresAt: pending.tokenExpiresAt,
    status: "CONNECTED",
    lastError: null,
    nextSyncAt: new Date()
  };
  const ids: string[] = [];
  for (const a of chosen) {
    const row = await adAccountDb.upsert({
      where: { brandId_platform_externalId: { brandId: pending.brandId, platform: pending.platform, externalId: a.externalId } },
      create: { brandId: pending.brandId, platform: pending.platform, externalId: a.externalId, name: a.name, currency: a.currency, loginCustomerId: a.loginCustomerId ?? null, ...tokenData },
      update: { name: a.name, currency: a.currency, loginCustomerId: a.loginCustomerId ?? null, connectedAt: new Date(), ...tokenData }
    });
    ids.push(row.id);
  }
  // Même jeton pour les autres comptes déjà suivis de ce profil : on le
  // rafraîchit aussi, sinon ils resteraient « à reconnecter ».
  const sameLogin = existing.filter((a) => a.platform === pending.platform && !wanted.has(a.externalId) && r.accounts.some((x) => x.externalId === a.externalId));
  for (const a of sameLogin) await adAccountDb.update({ where: { id: a.id }, data: { ...tokenData, connectedAt: new Date() } });

  await pendingAdAuthDb.deleteMany({ where: { id: pending.id } });
  return NextResponse.json({ ok: true, accountIds: ids });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await load(params.id);
  if ("error" in r) return r.error;
  await pendingAdAuthDb.deleteMany({ where: { id: r.pending.id } });
  return NextResponse.json({ ok: true });
}
