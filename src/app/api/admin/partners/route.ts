import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerUserId } from "@/lib/admin";
import { grantPartnerAccess, listPartnerGrants, revokePartnerAccess } from "@/lib/billing/partners";

// /api/admin/partners — accès offerts (section IV de la note du 24/09/2026).
// Réservé au compte propriétaire (404 sinon, comme /admin/acquisition).
//   GET    → liste des attributions
//   POST   { email, plan, maxBrands, months|null, note? } → crée + applique
//   DELETE { id } → révoque
export async function GET() {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ grants: await listPartnerGrants() });
}

const postSchema = z.object({
  email: z.string().trim().email().max(200),
  plan: z.enum(["PRO", "AGENCY"]),
  maxBrands: z.number().int().min(1).max(50),
  months: z.number().int().min(1).max(60).nullable(),
  note: z.string().max(200).optional()
});

export async function POST(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Données invalides (email, palier, marques, durée)." }, { status: 400 });
  const result = await grantPartnerAccess(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireOwnerUserId())) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await revokePartnerAccess(body.id);
  return NextResponse.json({ ok: true });
}
