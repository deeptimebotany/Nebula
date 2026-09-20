import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  comment: z.string().max(2000).optional(),
  respondedName: z.string().max(80).optional()
});

// POST /api/public/approvals/[token]/posts/[postId] — le client approuve ou
// demande des modifications sur une publication, avec un commentaire libre
// et son nom (facultatif, purement déclaratif — pas de compte requis).
export async function POST(req: NextRequest, { params }: { params: { token: string; postId: string } }) {
  const link = await prisma.approvalLink.findUnique({ where: { token: params.token } });
  if (!link || link.revokedAt) {
    return NextResponse.json({ error: "Lien invalide ou révoqué." }, { status: 404 });
  }

  const post = await prisma.post.findUnique({ where: { id: params.postId }, select: { id: true, brandId: true } });
  if (!post || post.brandId !== link.brandId) {
    return NextResponse.json({ error: "Publication introuvable pour ce lien." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { status, comment, respondedName } = parsed.data;

  const approval = await prisma.postApproval.upsert({
    where: { postId: post.id },
    update: { status, comment: comment || null, respondedName: respondedName || null, respondedAt: new Date() },
    create: { postId: post.id, status, comment: comment || null, respondedName: respondedName || null, respondedAt: new Date() }
  });

  return NextResponse.json({ ok: true, approval });
}
