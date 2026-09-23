import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { trackGrowth } from "@/lib/growth";
import { UPCOMING_NETWORKS } from "@/data/competitors";

// POST /api/public/waitlist — liste d'attente par réseau (brief growth, lot
// G5.d) : « Prévenez-moi quand Threads / LinkedIn / Pinterest / Bluesky
// arrive ». Un enregistrement par (email, réseau) ; les compteurs ne sont
// visibles que dans /admin/acquisition. Rate-limit + Turnstile.
const bodySchema = z.object({
  email: z.string().trim().email().max(200),
  network: z.string().max(40),
  consent: z.boolean().default(false),
  turnstileToken: z.string().optional()
});

export async function POST(req: NextRequest) {
  const rate = await consumeRateLimit("waitlist", clientIpFromHeaders(req.headers), 10, 60);
  if (!rate.ok) return NextResponse.json({ error: "Trop de tentatives, réessayez plus tard." }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
  const { email, network, consent, turnstileToken } = parsed.data;
  if (!UPCOMING_NETWORKS.some((n) => n.slug === network)) return NextResponse.json({ error: "Réseau inconnu." }, { status: 400 });

  if (!(await verifyTurnstileToken(turnstileToken))) {
    return NextResponse.json({ error: "Vérification anti-robot échouée, réessayez." }, { status: 400 });
  }

  await prisma.networkWaitlist.upsert({
    where: { email_network: { email: email.toLowerCase(), network } },
    update: { consent },
    create: { email: email.toLowerCase(), network, consent }
  });
  await trackGrowth("waitlist_joined", { network, consent });
  return NextResponse.json({ ok: true });
}
