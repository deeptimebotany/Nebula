// Prospects des outils gratuits (audit sécurité, lot 1).
//
// - Le nom de l'outil vient d'une liste fermée : avant, n'importe quel texte
//   était accepté puis placé tel quel dans un lien d'e-mail.
// - Double confirmation : l'inscription aux conseils envoie UN e-mail
//   « Confirmez votre inscription » ; la séquence de conseils (lead_t0, t2,
//   t5 — voir emails/lifecycle.ts) ne part qu'après le clic. Avant,
//   n'importe qui pouvait inscrire l'adresse d'un tiers et lui faire envoyer
//   trois e-mails.
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { deriveKey } from "@/lib/secrets";
import { sendEmail } from "@/lib/email";
import { EMAIL_COLORS, emailButton, emailFrame } from "@/lib/emails/brand";
import { publicAppUrl } from "@/lib/account-security";

export const TOOL_SLUGS = ["audit", "bio-instagram", "hashtags", "legendes", "meilleur-moment", "miniatures", "taux-engagement", "titre-youtube"] as const;
export type ToolSlug = (typeof TOOL_SLUGS)[number];

export function isToolSlug(value: string): value is ToolSlug {
  return (TOOL_SLUGS as readonly string[]).includes(value);
}

/** Chemin de l'outil, ou la page des outils si le nom est inconnu (anciennes lignes). */
export function toolPathFor(tool: string): string {
  return isToolSlug(tool) ? `/outils/${tool}` : "/outils";
}

function sign(leadId: string): string {
  return createHmac("sha256", deriveKey("lead-confirm")).update(leadId).digest("base64url");
}

export function verifyLeadSignature(leadId: string, sig: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(leadId));
  return a.length === b.length && timingSafeEqual(a, b);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Enregistre un prospect. Avec consentement : e-mail de confirmation, sauf
 * si l'adresse est déjà confirmée (la nouvelle ligne l'est d'office) ou si
 * une confirmation lui a déjà été envoyée dans les 24 dernières heures.
 */
export async function recordToolLead(input: { email: string; tool: ToolSlug; consent: boolean; ipHash: string | null }): Promise<void> {
  const email = input.email.toLowerCase();
  if (!input.consent) {
    await prisma.toolLead.create({ data: { email, tool: input.tool, consent: false, ipHash: input.ipHash } });
    return;
  }
  const alreadyConfirmed = await prisma.toolLead.findFirst({ where: { email, confirmedAt: { not: null } }, select: { id: true } });
  if (alreadyConfirmed) {
    await prisma.toolLead.create({ data: { email, tool: input.tool, consent: true, ipHash: input.ipHash, confirmedAt: new Date() } });
    return;
  }
  const recentlySent = await prisma.toolLead.findFirst({
    where: { email, confirmationSentAt: { gte: new Date(Date.now() - DAY_MS) } },
    select: { id: true }
  });
  const lead = await prisma.toolLead.create({
    data: { email, tool: input.tool, consent: true, ipHash: input.ipHash, confirmationSentAt: new Date() }
  });
  if (recentlySent) return;

  const url = `${publicAppUrl()}/api/public/tools/lead/confirm?id=${encodeURIComponent(lead.id)}&sig=${sign(lead.id)}`;
  const result = await sendEmail({
    to: email,
    subject: "Confirmez votre inscription aux conseils Nebula",
    html: emailFrame(`
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">Une dernière étape</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55">Vous avez demandé à recevoir les conseils Nebula pour vos réseaux sociaux. Confirmez votre adresse pour les recevoir (trois e-mails, désinscription en un clic).</p>
      <p style="margin:22px 0">${emailButton("Confirmer mon inscription", url)}</p>
      <p style="margin:0;color:${EMAIL_COLORS.muted};font-size:13px;line-height:1.5">Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail : vous ne recevrez rien d'autre.</p>
    `),
    text: `Confirmez votre inscription aux conseils Nebula : ${url}\n\nVous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail.`
  });
  if (!result.ok) console.error("[tool-leads] e-mail de confirmation non envoyé :", result.error);
}
