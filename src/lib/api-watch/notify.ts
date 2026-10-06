// Alertes de la veille des API (02/10/2026) : cloche du propriétaire ET
// e-mail (adresse du compte propriétaire), pour être prévenu même sans
// ouvrir Nebula. L'e-mail part une seule fois par alerte (clé
// d'idempotence) ; sans RESEND_API_KEY, la cloche suffit.
import { prisma } from "@/lib/prisma";
import { alertOwner } from "@/lib/owner-alerts";
import { OWNER_EMAIL } from "@/lib/owner";
import { emailIdempotencyKey, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { emailButton, emailFrame } from "@/lib/emails/brand";

export const API_WATCH_HREF = "/admin/api";

function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://nebulahub.space").replace(/\/$/, "");
}

/** Le propriétaire a-t-il déjà reçu cette alerte (même clé) ? */
export async function alreadyAlerted(dedupeKey: string): Promise<boolean> {
  const found = await prisma.notification
    .findFirst({ where: { dedupeKey, user: { email: OWNER_EMAIL } }, select: { id: true } })
    .catch(() => null);
  return Boolean(found);
}

/**
 * Alerte unique (cloche + e-mail) : une clé déjà envoyée ne repart jamais,
 * même si la tâche repasse (les rappels d'échéance sont recalculés chaque jour).
 * Les textes de l'e-mail sont ceux de la veille des API, sauf s'ils sont
 * donnés (plafond TikTok, 06/10/2026).
 */
export async function alertOwnerWithEmail(input: {
  title: string;
  body: string;
  dedupeKey: string;
  href?: string;
  subject?: string;
  actionLabel?: string;
  button?: string;
  footer?: string;
}): Promise<void> {
  if (await alreadyAlerted(input.dedupeKey)) return;
  const href = input.href ?? API_WATCH_HREF;
  await alertOwner({ title: input.title, body: input.body, dedupeKey: input.dedupeKey, href, actionLabel: input.actionLabel ?? "Voir la veille" });
  if (!isEmailConfigured()) return;
  await sendEmail({
    to: OWNER_EMAIL,
    subject: input.subject ?? `Veille des API — ${input.title}`,
    idempotencyKey: emailIdempotencyKey("api-watch", OWNER_EMAIL, input.dedupeKey),
    html: emailFrame(`
      <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#111827">${escapeHtml(input.title)}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55">${escapeHtml(input.body)}</p>
      <p style="margin:22px 0">${emailButton(input.button ?? "Ouvrir la veille des API", `${appUrl()}${href}`)}</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">${escapeHtml(input.footer ?? "E-mail réservé au propriétaire de Nebula : calendrier des versions, annonces des changelogs officiels et signaux lus dans les réponses des API.")}</p>
    `),
    text: `${input.title}\n\n${input.body}\n\n${appUrl()}${href}`
  }).catch(() => undefined);
}
