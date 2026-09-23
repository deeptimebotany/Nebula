import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { ipHashFromRequest } from "@/lib/public-tools-limit";
import { trackGrowth } from "@/lib/growth";

// POST /api/public/drafts — « Programmer cette publication avec Nebula »
// (brief growth, lot G4.a) : met de côté le résultat d'un outil gratuit
// (légende, miniature) le temps que le visiteur crée un compte, puis le
// Composer le récupère via ?draft=<id> (GET/DELETE dans [id]/route.ts).
// Sans authentification, limité par IP, expire en 7 jours (purge cron).
const bodySchema = z.object({
  kind: z.enum(["CAPTION", "THUMBNAIL"]),
  tool: z.string().max(40).optional(),
  network: z.string().max(20).optional(),
  content: z.object({
    title: z.string().max(200).optional(),
    caption: z.string().max(5000).optional(),
    // Miniature générée : image en base64 (≤ 2 Mo) réinjectée comme média.
    imageBase64: z.string().max(2_800_000).optional(),
    imageMimeType: z.string().max(60).optional()
  })
});

export async function POST(req: NextRequest) {
  const rate = await consumeRateLimit("public-drafts", clientIpFromHeaders(req.headers), 20, 10);
  if (!rate.ok) return NextResponse.json({ error: "Trop de tentatives, réessayez dans quelques minutes." }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Contenu invalide." }, { status: 400 });
  const { kind, content, network, tool } = parsed.data;
  if (!content.title && !content.caption && !content.imageBase64) return NextResponse.json({ error: "Rien à programmer." }, { status: 400 });

  const draft = await prisma.publicDraft.create({
    data: {
      kind,
      content,
      network: network ?? null,
      ipHash: ipHashFromRequest(req),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    select: { id: true }
  });
  await trackGrowth("tool_cta_click", { tool: tool ?? kind.toLowerCase(), kind });
  return NextResponse.json({ id: draft.id, next: `/composer?draft=${draft.id}` });
}
