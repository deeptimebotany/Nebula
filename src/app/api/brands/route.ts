import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertBrandQuota } from "@/lib/billing/plan";
import { z } from "zod";
import { listUserBrands } from "@/lib/server-data/brands";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  return NextResponse.json({ brands: await listUserBrands((session.user as { id: string }).id) });
}

const bodySchema = z.object({ name: z.string().min(2).max(80) });

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `marque-${Date.now()}`
  );
}

// POST /api/brands { name } — crée une nouvelle marque pour le compte
// connecté (qui en devient OWNER), gardé par le quota "nombre de marques"
// de son abonnement (voir src/lib/plans.ts / assertBrandQuota).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Nom de marque invalide (2 caractères minimum)." }, { status: 400 });

  const userId = (session.user as { id: string }).id;

  try {
    await assertBrandQuota(userId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, reason: "second_brand" }, { status: 403 });
  }

  let slug = slugify(parsed.data.name);
  const slugTaken = await prisma.brand.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

  const brand = await prisma.brand.create({
    data: {
      name: parsed.data.name,
      slug,
      memberships: { create: { userId, role: "OWNER" } }
    }
  });

  return NextResponse.json({ ok: true, brand });
}
