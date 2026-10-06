import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getSummarySettings, updateSummarySettings } from "@/lib/monthly-summary/send";

// Bilan du mois (03/10/2026) : GET les réglages (activé, marques cochées),
// PATCH { enabled?, brandIds? }. Seules les marques dont la personne est
// membre peuvent être cochées.
const bodySchema = z.object({ enabled: z.boolean().optional(), brandIds: z.array(z.string().min(1).max(64)).max(100).optional() });

async function userId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  return NextResponse.json(await getSummarySettings(id));
}

export async function PATCH(req: NextRequest) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.enabled === undefined && !parsed.data.brandIds)) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const out = await updateSummarySettings(id, parsed.data);
  if ("error" in out) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
