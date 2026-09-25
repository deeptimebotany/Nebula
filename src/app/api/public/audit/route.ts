import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { consumePublicQuota, ipHashFromRequest, releasePublicQuota } from "@/lib/public-tools-limit";
import { parseAuditInput } from "@/lib/audit/parse-input";
import { AUDIT_MISS_LIMIT, createAudit } from "@/lib/audit/run";
import { AUDIT_DAILY_LIMIT } from "@/lib/audit/types";

// POST /api/public/audit — audit de présence en ligne gratuit, SANS COMPTE
// (produit n°8, page /outils/audit). Protégé par Turnstile et un quota de
// 3 audits par jour et par IP ; mêmes comptes dans les 24 h : le rapport
// existant est resservi. Réponse : le jeton du rapport (/audit/<jeton>).
// Sources lues en parallèle, 8 s au plus chacune : bien sous le délai de
// la fonction.
export const maxDuration = 60;

const field = z.string().max(300).optional();
const bodySchema = z.object({
  youtube: field,
  instagram: field,
  tiktok: field,
  website: field,
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional(),
  tips: z.boolean().optional(),
  turnstileToken: z.string().max(4_000).optional()
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((i) => i.path[0] === "email");
    return NextResponse.json({ error: emailIssue ? "Adresse e-mail invalide." : "Demande invalide.", ...(emailIssue ? { errors: { email: "Adresse e-mail invalide." } } : {}) }, { status: 400 });
  }
  const body = parsed.data;
  const input = parseAuditInput(body);
  if (!input.ok) return NextResponse.json({ error: input.message, errors: input.errors }, { status: 400 });

  if (!(await verifyTurnstileToken(body.turnstileToken))) {
    return NextResponse.json({ error: "Vérification anti-robot échouée : rechargez la page et réessayez." }, { status: 403 });
  }

  const result = await createAudit({
    input: input.input,
    ipHash: ipHashFromRequest(req),
    consumeQuota: () => consumePublicQuota(req, "audit", AUDIT_DAILY_LIMIT),
    // Essai sans rien de lisible : rendu (10 par jour au plus, compté à part).
    refundMiss: async () => {
      if ((await consumePublicQuota(req, "audit-miss", AUDIT_MISS_LIMIT)).ok) await releasePublicQuota(req, "audit");
    },
    email: body.email || null,
    tips: body.tips === true
  });
  if (!result.ok) return NextResponse.json({ error: result.error, sources: result.sources }, { status: result.status });
  return NextResponse.json({ token: result.token, cached: result.cached, sources: result.sources });
}
