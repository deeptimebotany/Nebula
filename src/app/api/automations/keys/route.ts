import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyDb } from "@/lib/prisma-extra";
import { automationSession } from "@/lib/api/session";
import { accessibleBrands } from "@/lib/api/access";
import { generateApiKey } from "@/lib/api/keys";

const bodySchema = z.object({ name: z.string().trim().min(1).max(60), scope: z.enum(["read", "write"]), brandId: z.string().min(1).nullable().optional() });

// POST /api/automations/keys — crée une clé d'API. La clé complète n'est
// renvoyée qu'ici, une seule fois (seule son empreinte est stockée).
export async function POST(req: NextRequest) {
  const s = await automationSession(true);
  if (!s.ok) return s.res;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Donnez un nom à la clé." }, { status: 400 });
  if (parsed.data.brandId) {
    const [brand] = await accessibleBrands(s.userId, parsed.data.brandId);
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }
  const active = await apiKeyDb.count({ where: { userId: s.userId, revokedAt: null } });
  if (active >= 10) return NextResponse.json({ error: "10 clés actives au maximum : révoquez-en une d'abord." }, { status: 400 });
  const { key, prefix, hash } = generateApiKey();
  const row = await apiKeyDb.create({
    data: {
      userId: s.userId,
      name: parsed.data.name,
      prefix,
      keyHash: hash,
      scopes: parsed.data.scope === "write" ? "read,write" : "read",
      brandId: parsed.data.brandId ?? null
    }
  });
  return NextResponse.json({ key, id: row.id });
}
