import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { markEasterEggFound } from "@/lib/easter-eggs/server";
import { isValidEasterEggKey } from "@/lib/easter-eggs-registry";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ key: z.string() });

// POST /api/easter-eggs/found — appelée par reportEasterEggFound() (voir ce
// fichier) au moment où un easter egg détectable côté client se déclenche.
// Idempotent : retrouver le même easter egg plusieurs fois ne fait rien de
// plus, `isNew` ne vaut true que la toute première fois.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!isValidEasterEggKey(parsed.data.key)) {
    return NextResponse.json({ error: "Easter egg inconnu." }, { status: 400 });
  }

  const userId = (session.user as { id: string }).id;
  const isNew = await markEasterEggFound(userId, parsed.data.key);
  return NextResponse.json({ ok: true, isNew });
}
