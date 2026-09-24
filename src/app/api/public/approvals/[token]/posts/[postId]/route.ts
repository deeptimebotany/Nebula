import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIpFromHeaders, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { notifyMany, brandEditorIds } from "@/lib/notifications";
import { emitWebhookEvent, postPayload } from "@/lib/webhooks";

const bodySchema = z.object({
  status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  comment: z.string().trim().max(1000).optional(),
  respondedName: z.string().trim().max(80).optional()
});

// POST /api/public/approvals/[token]/posts/[postId] — réponse du client de
// l'agence sur une publication (page publique /approve/[token]). Ajouté le
// 25/09/2026 : la page appelait déjà cette adresse, mais elle n'existait
// pas, donc les validations n'étaient jamais enregistrées. Le token fait
// office de secret d'accès ; la publication doit appartenir à la marque du
// lien et être encore à venir (brouillon ou programmée).
export async function POST(req: NextRequest, { params }: { params: { token: string; postId: string } }) {
  const rate = await consumeRateLimit("approval-respond", clientIpFromHeaders(req.headers), 60, 10);
  if (!rate.ok) return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });

  const link = await prisma.approvalLink.findUnique({ where: { token: params.token } });
  if (!link || link.revokedAt) return NextResponse.json({ error: "Lien invalide ou révoqué." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });

  const post = await prisma.post.findFirst({
    where: { id: params.postId, brandId: link.brandId, status: { in: ["DRAFT", "SCHEDULED"] } },
    select: { id: true, title: true, caption: true, brandId: true, createdById: true }
  });
  if (!post) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });

  const { status, comment, respondedName } = parsed.data;
  await prisma.postApproval.upsert({
    where: { postId: post.id },
    update: { status, comment: comment || null, respondedName: respondedName || null, respondedAt: new Date() },
    create: { postId: post.id, status, comment: comment || null, respondedName: respondedName || null, respondedAt: new Date() }
  });

  // Centre de notifications : l'auteur et les éditeurs de la marque.
  const label = (post.title || post.caption.split("\n")[0] || "votre publication").trim();
  const name = label.length > 60 ? `${label.slice(0, 59)}…` : label;
  const who = respondedName || "Votre client";
  const recipients = [post.createdById, ...(await brandEditorIds(post.brandId))];
  await notifyMany(recipients, {
    kind: "approval",
    title: status === "APPROVED" ? "Publication approuvée" : "Modifications demandées",
    body:
      status === "APPROVED"
        ? `${who} a validé « ${name} ».`
        : `${who} demande des modifications sur « ${name} »${comment ? ` : « ${comment} »` : "."}`,
    href: `/posts/${post.id}`,
    actionLabel: status === "APPROVED" ? null : "Voir la demande",
    dedupeKey: `approval:${post.id}`
  });

  // Webhooks (lot 4).
  await emitWebhookEvent(post.brandId, "approval.responded", {
    decision: status === "APPROVED" ? "approved" : "changes_requested",
    comment: comment || null,
    respondedBy: respondedName || null,
    post: await postPayload(post.id)
  });

  return NextResponse.json({ ok: true });
}
