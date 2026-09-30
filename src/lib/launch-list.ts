// Liste « Prévenez-moi du lancement » (pré-lancement, 30/09/2026) : lecture
// pour la page propriétaire /admin/lancement, ajout à la main des adresses
// reçues par e-mail, export CSV, et e-mail d'annonce le jour de l'ouverture.
// Un seul e-mail par adresse (notifiedAt), par paquets de 90 au plus : le
// palier gratuit de Resend autorise 100 e-mails par jour, et il faut en
// garder quelques-uns pour les e-mails du site (mot de passe oublié…).
import { prisma } from "@/lib/prisma";
import { emailIdempotencyKey, escapeHtml, sendEmail } from "@/lib/email";
import { emailLayout, emailPlainText, type EmailLayoutInput } from "@/lib/emails/layout";
import { SITE_URL } from "@/lib/site";
import { LAUNCH_WAITLIST, PRELAUNCH_CONTACT_EMAIL, isSiteOpen, prelaunchAllowedEmails } from "@/lib/launch";
export { parseEmailList } from "@/lib/launch";

/** Envois d'annonce par clic (palier gratuit de Resend : 100 par jour). */
export const LAUNCH_BATCH = 90;


export interface LaunchEntry {
  email: string;
  consent: boolean;
  createdAt: Date;
  notifiedAt: Date | null;
}

export interface LaunchSummary {
  open: boolean;
  total: number;
  notified: number;
  pending: number;
  withTips: number;
  last7Days: number;
  recent: LaunchEntry[];
  allowed: string[];
  /** Comptes existants qui ne peuvent pas se connecter pendant le pré-lancement. */
  blockedAccounts: number;
}

export async function loadLaunchSummary(recentLimit = 200): Promise<LaunchSummary> {
  const where = { network: LAUNCH_WAITLIST };
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const allowed = prelaunchAllowedEmails();
  const open = isSiteOpen();
  const [total, notified, withTips, last7Days, recent, blockedAccounts] = await Promise.all([
    prisma.networkWaitlist.count({ where }),
    prisma.networkWaitlist.count({ where: { ...where, notifiedAt: { not: null } } }),
    prisma.networkWaitlist.count({ where: { ...where, consent: true } }),
    prisma.networkWaitlist.count({ where: { ...where, createdAt: { gte: since } } }),
    prisma.networkWaitlist.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: recentLimit,
      select: { email: true, consent: true, createdAt: true, notifiedAt: true }
    }),
    open ? Promise.resolve(0) : prisma.user.count({ where: { email: { notIn: allowed } } })
  ]);
  return { open, total, notified, pending: total - notified, withTips, last7Days, recent, allowed, blockedAccounts };
}

/** Ajoute des adresses à la liste (reçues par e-mail) ; renvoie le nombre de nouvelles. */
export async function addToLaunchList(emails: string[]): Promise<number> {
  if (emails.length === 0) return 0;
  const res = await prisma.networkWaitlist.createMany({
    data: emails.slice(0, 1000).map((email) => ({ email, network: LAUNCH_WAITLIST, consent: false })),
    skipDuplicates: true
  });
  return res.count;
}

function csvCell(v: string): string {
  // Anti-injection de formule (Excel, LibreOffice) + guillemets doublés.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function launchListCsv(): Promise<string> {
  const rows = await prisma.networkWaitlist.findMany({
    where: { network: LAUNCH_WAITLIST },
    orderBy: { createdAt: "asc" },
    select: { email: true, consent: true, createdAt: true, notifiedAt: true }
  });
  const lines = [["email", "inscrit_le", "conseils", "prevenu_le"].join(",")];
  for (const r of rows) {
    lines.push([csvCell(r.email), csvCell(r.createdAt.toISOString()), r.consent ? "oui" : "non", csvCell(r.notifiedAt ? r.notifiedAt.toISOString() : "")].join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function launchAnnouncement(): EmailLayoutInput & { subject: string } {
  const url = `${SITE_URL}/register?utm_source=lancement&utm_medium=email&utm_campaign=ouverture`;
  return {
    subject: "Nebula est ouvert !",
    title: "Nebula est ouvert !",
    // Paragraphes en HTML déjà échappé (<strong> autorisé), voir emailLayout.
    paragraphs: [
      "Bonjour,",
      `${escapeHtml("Vous nous aviez demandé de vous prévenir : c'est le grand jour,")} <strong>Nebula ouvre ses portes à tous</strong>.`,
      escapeHtml(
        "Programmez vos publications sur tous vos réseaux au même endroit, suivez vos statistiques et laissez l'assistant vous proposer des idées. Le palier Gratuit n'a pas de limite de durée, et aucune carte bancaire n'est demandée."
      )
    ],
    cta: { label: "Créer mon espace", url },
    footnotes: [
      escapeHtml("Vous recevez cet unique e-mail parce que vous avez laissé votre adresse sur la page « Bientôt » de Nebula. Aucune autre relance ne suivra."),
      escapeHtml(`Une question ? Répondez simplement à cet e-mail ou écrivez à ${PRELAUNCH_CONTACT_EMAIL}.`)
    ],
    signature: true
  };
}

export interface AnnounceResult {
  sent: number;
  failed: number;
  remaining: number;
  error?: string;
}

/**
 * Envoie l'annonce aux adresses pas encore prévenues (au plus `limit`),
 * seulement une fois le site ouvert. Clé d'idempotence par adresse : un
 * double clic ou un nouvel essai n'envoie jamais deux fois le même e-mail.
 */
export async function sendLaunchAnnouncement(limit = LAUNCH_BATCH): Promise<AnnounceResult> {
  const where = { network: LAUNCH_WAITLIST, notifiedAt: null };
  if (!isSiteOpen()) {
    return { sent: 0, failed: 0, remaining: await prisma.networkWaitlist.count({ where }), error: "Le site est encore en pré-lancement : ouvrez-le d'abord (NEXT_PUBLIC_SITE_OPEN=true dans Vercel, puis redéployer)." };
  }
  const batch = await prisma.networkWaitlist.findMany({ where, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(limit, LAUNCH_BATCH)), select: { id: true, email: true } });
  const mail = launchAnnouncement();
  const html = emailLayout(mail);
  const text = emailPlainText(mail);
  let sent = 0;
  let failed = 0;
  let inARow = 0;
  let error: string | undefined;
  for (const row of batch) {
    const res = await sendEmail({
      to: row.email,
      subject: mail.subject,
      html,
      text,
      replyTo: PRELAUNCH_CONTACT_EMAIL,
      idempotencyKey: emailIdempotencyKey("launch-announcement", row.email)
    });
    if (res.ok) {
      sent++;
      inARow = 0;
      await prisma.networkWaitlist.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
    } else {
      failed++;
      inARow++;
      error = res.error;
      // Trois refus d'affilée : configuration ou quota du jour chez Resend,
      // inutile d'insister (les adresses restent à prévenir).
      if (inARow >= 3) break;
    }
  }
  const remaining = await prisma.networkWaitlist.count({ where });
  return { sent, failed, remaining, ...(error ? { error } : {}) };
}
