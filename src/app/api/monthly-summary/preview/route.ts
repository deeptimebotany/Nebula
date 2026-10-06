import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { sendSummaryPreview } from "@/lib/monthly-summary/send";

// « M'envoyer un aperçu » (03/10/2026) : le bilan du mois dernier d'une de
// ses marques, à sa propre adresse. Une demande par minute au plus.
const bodySchema = z.object({ brandId: z.string().min(1).max(64).optional() });
const lastPreview = new Map<string, number>();

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const last = lastPreview.get(userId) ?? 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ error: "Un aperçu vient de partir : patientez une minute." }, { status: 429 });
  lastPreview.set(userId, Date.now());
  const out = await sendSummaryPreview(userId, parsed.data.brandId);
  if (!out.ok) {
    lastPreview.delete(userId);
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json(out);
}
