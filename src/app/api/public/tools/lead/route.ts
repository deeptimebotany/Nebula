import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordToolLead, TOOL_SLUGS } from "@/lib/tool-leads";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { grantLeadBonus, ipHashFromRequest, LEAD_BONUS_GENERATIONS } from "@/lib/public-tools-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { trackGrowth } from "@/lib/growth";

// POST /api/public/tools/lead — capture d'email progressive des outils
// gratuits (brief growth, lot G4.b) : « Recevez 5 générations de plus par
// jour ». Enregistre le lead (avec ou sans consentement aux conseils),
// accorde le bonus du jour à l'IP, et laisse la séquence lead_* des emails
// de cycle de vie faire le reste (voir src/lib/emails/lifecycle.ts).
const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  // Liste fermée (audit sécurité, lot 1 — voir src/lib/tool-leads.ts).
  tool: z.enum(TOOL_SLUGS),
  consent: z.boolean().default(false),
  turnstileToken: z.string().optional()
});

export async function POST(req: NextRequest) {
  const rate = await consumeRateLimit("tool-lead", clientIpFromHeaders(req.headers), 10, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de tentatives, réessayez plus tard." }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  const { email, tool, consent, turnstileToken } = parsed.data;

  if (!(await verifyTurnstileToken(turnstileToken))) {
    return NextResponse.json({ error: "Vérification anti-robot échouée, réessayez." }, { status: 400 });
  }

  // Avec consentement : e-mail de confirmation avant tout conseil (double
  // confirmation, voir src/lib/tool-leads.ts).
  await recordToolLead({ email, tool, consent, ipHash: ipHashFromRequest(req) });
  await grantLeadBonus(req);
  await trackGrowth("tool_lead", { tool, consent });
  return NextResponse.json({ ok: true, bonus: LEAD_BONUS_GENERATIONS });
}
