import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBrandMembership } from "@/lib/brand-access";
import { assertConnectionQuota } from "@/lib/billing/plan";
import { upsertConnection } from "@/lib/connections";
import { connectWithAppPassword } from "@/lib/social/bluesky";
import { consumeRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

const bodySchema = z.object({
  brandId: z.string().min(1),
  identifier: z.string().trim().min(3).max(253),
  appPassword: z.string().trim().min(8).max(64)
});

// POST /api/social/bluesky/connect — connecte un compte Bluesky à une marque
// avec un mot de passe d'application (voir src/lib/social/bluesky.ts). Le
// mot de passe sert une seule fois à ouvrir la session et n'est jamais
// enregistré.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const rate = await consumeRateLimit("bluesky-connect", userId, 10, 15);
  if (!rate.ok) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Renseignez votre identifiant et votre mot de passe d'application." }, { status: 400 });
  const { brandId, identifier, appPassword } = parsed.data;

  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  try {
    const token = await connectWithAppPassword(identifier, appPassword);
    // Reconnecter un compte déjà relié ne consomme pas de place en plus.
    const existing = await prisma.socialConnection.findUnique({
      where: { brandId_network_externalAccountId: { brandId, network: "BLUESKY", externalAccountId: token.externalAccountId } },
      select: { id: true }
    });
    if (!existing) await assertConnectionQuota(brandId);
    await upsertConnection(brandId, "BLUESKY", token);
    return NextResponse.json({ ok: true, handle: token.handle });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.replace(/^\[BLUESKY\]\s*/, "") }, { status: 400 });
  }
}
