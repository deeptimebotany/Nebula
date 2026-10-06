// Bilan du mois (03/10/2026) : réglages, envoi automatique, aperçu et
// désinscription. Serveur uniquement.
//
// Envoi : à partir du 3 du mois à 9 h (heure de Paris), le bilan du mois
// précédent, un e-mail par marque cochée, pour les personnes qui l'ont
// activé (User.monthlySummaryAt). Une ligne MonthlySummary est posée AVANT
// l'envoi (contrainte unique) : jamais deux envois. Plafond par jour
// (MONTHLY_SUMMARY_DAILY_LIMIT, 90 par défaut pour rester sous les 100
// e-mails par jour de Resend gratuit ; 0 = sans plafond). Un refus passager
// est retenté jusqu'à 3 fois, espacées de 2 h. Une marque sans aucune donnée
// sur le mois ne reçoit rien (SKIPPED).
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailIdempotencyKey } from "@/lib/email";
import { emailLogoUrl } from "@/lib/emails/brand";
import { deriveKey } from "@/lib/secrets";
import { bioClicksTotal, loadMonthlySummary } from "./data";
import { renderSummaryEmail, type SummaryLinks } from "./email";
import { monthKeyOf, previousMonth, type MonthKey } from "./period";
import { SEND_TZ, dueMonth } from "./period-window";

export { SEND_DAY, SEND_HOUR, SEND_TZ, dueMonth, endOfMonthSyncWindow } from "./period-window";

export const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 2 * 3_600_000;
/** Bilans traités par passage du cron (le cron a 60 s en tout). */
export const SUMMARIES_PER_RUN = 3;
/** Pas de nouveau bilan entamé au-delà (le cron a 60 s pour toutes ses tâches). */
const TIME_BUDGET_MS = 20_000;

function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://nebulahub.space").replace(/\/$/, "");
}

/** Plafond d'envois par jour (UTC, comme le quota de Resend) ; Infinity = sans plafond. */
export function dailyLimit(raw: string | undefined = process.env.MONTHLY_SUMMARY_DAILY_LIMIT): number {
  if (raw === undefined || raw.trim() === "") return 90;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) return 90;
  return n === 0 ? Infinity : Math.floor(n);
}

// --- Désinscription (lien signé, sans connexion) ------------------------------------------

export function summaryUnsubscribeToken(userId: string): string {
  const payload = Buffer.from(userId).toString("base64url");
  const sig = createHmac("sha256", deriveKey("monthly-summary")).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySummaryUnsubscribeToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", deriveKey("monthly-summary")).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function summaryUnsubscribeUrl(userId: string): string {
  return `${appUrl()}/api/email/bilan/unsubscribe?token=${encodeURIComponent(summaryUnsubscribeToken(userId))}`;
}

export function summaryLinks(userId: string, brandId: string, month: MonthKey): SummaryLinks {
  const base = appUrl();
  const utm = "utm_source=email&utm_medium=bilan";
  return {
    logoUrl: emailLogoUrl(),
    bilanUrl: `${base}/analytics/bilan?brand=${encodeURIComponent(brandId)}&month=${month}&${utm}`,
    calendarUrl: `${base}/calendar?${utm}`,
    engagementsUrl: `${base}/engagements?${utm}`,
    settingsUrl: `${base}/settings#compte`,
    unsubscribeUrl: summaryUnsubscribeUrl(userId),
    billingUrl: `${base}/billing?${utm}`
  };
}

// --- Réglages ----------------------------------------------------------------------------------

export interface SummarySettings {
  enabled: boolean;
  /** Marques cochées (toutes si la liste enregistrée est vide). */
  brandIds: string[];
  brands: { id: string; name: string; accounts: number }[];
  last: { month: string; sentAt: string | null; status: string } | null;
}

async function userBrands(userId: string): Promise<{ id: string; name: string; accounts: number }[]> {
  const rows = (await prisma.membership.findMany({
    where: { userId },
    select: { brand: { select: { id: true, name: true, createdAt: true, _count: { select: { connections: true } } } } },
    orderBy: { brand: { createdAt: "asc" } }
  })) as { brand: { id: string; name: string; _count: { connections: number } } }[];
  return rows.map((r) => ({ id: r.brand.id, name: r.brand.name, accounts: r.brand._count.connections }));
}

export async function getSummarySettings(userId: string): Promise<SummarySettings> {
  const [user, brands, last] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { monthlySummaryAt: true, monthlySummaryBrandIds: true } }),
    userBrands(userId),
    prisma.monthlySummary.findFirst({ where: { userId, status: { in: ["SENT", "FAILED"] } }, orderBy: { lastAttemptAt: "desc" }, select: { month: true, sentAt: true, status: true } })
  ]);
  const chosen = (user?.monthlySummaryBrandIds ?? []).filter((id: string) => brands.some((b) => b.id === id));
  return {
    enabled: Boolean(user?.monthlySummaryAt),
    brandIds: chosen.length ? chosen : brands.map((b) => b.id),
    brands,
    last: last ? { month: last.month, sentAt: last.sentAt?.toISOString() ?? null, status: last.status } : null
  };
}

export async function updateSummarySettings(userId: string, input: { enabled?: boolean; brandIds?: string[] }): Promise<SummarySettings | { error: string }> {
  const data: { monthlySummaryAt?: Date | null; monthlySummaryBrandIds?: string[] } = {};
  if (typeof input.enabled === "boolean") {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { monthlySummaryAt: true } });
    data.monthlySummaryAt = input.enabled ? current?.monthlySummaryAt ?? new Date() : null;
  }
  if (input.brandIds) {
    const brands = await userBrands(userId);
    const allowed = new Set(brands.map((b) => b.id));
    const ids = Array.from(new Set(input.brandIds)).filter((id) => allowed.has(id));
    if (ids.length === 0) return { error: "Cochez au moins une marque." };
    // Toutes cochées : liste vide (les marques créées plus tard seront comprises).
    data.monthlySummaryBrandIds = ids.length === brands.length ? [] : ids;
  }
  if (Object.keys(data).length) await prisma.user.update({ where: { id: userId }, data });
  return getSummarySettings(userId);
}

export async function unsubscribeMonthlySummary(userId: string): Promise<boolean> {
  const res = await prisma.user.updateMany({ where: { id: userId }, data: { monthlySummaryAt: null } });
  return res.count > 0;
}

// --- Envoi ---------------------------------------------------------------------------------------

async function deliver(userId: string, email: string, brandId: string, month: MonthKey, opts: { withReussites: boolean; preview?: boolean }): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; error?: string; retryable?: boolean; bioClicks: number | null }> {
  const data = await loadMonthlySummary(brandId, month, { userId, withReussites: opts.withReussites });
  if (!data || !data.hasData) return { status: "SKIPPED", bioClicks: null };
  const links = summaryLinks(userId, brandId, month);
  const { subject, html, text } = renderSummaryEmail(data, links);
  const res = await sendEmail({
    to: email,
    subject: opts.preview ? `[Aperçu] ${subject}` : subject,
    html,
    text,
    idempotencyKey: opts.preview ? undefined : emailIdempotencyKey("monthly-summary", email, `${brandId}:${month}`),
    headers: {
      // Désinscription en un clic (RFC 8058), exigée par Gmail et Yahoo pour les envois réguliers.
      "List-Unsubscribe": `<${links.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });
  if (!res.ok) return { status: "FAILED", error: res.error, retryable: res.retryable, bioClicks: null };
  return { status: "SENT", bioClicks: await bioClicksTotal(brandId) };
}

export interface RunResult {
  month: MonthKey | null;
  sent: number;
  skipped: number;
  failed: number;
  capped: boolean;
}

/** Passage du cron : quelques bilans à la fois, dans le plafond du jour. */
export async function runMonthlySummaries(now: Date = new Date(), perRun = SUMMARIES_PER_RUN): Promise<RunResult> {
  const month = dueMonth(now);
  const result: RunResult = { month, sent: 0, skipped: 0, failed: 0, capped: false };
  if (!month) return result;
  const started = Date.now();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const limit = dailyLimit();
  let sentToday = Number.isFinite(limit) ? await prisma.monthlySummary.count({ where: { status: "SENT", sentAt: { gte: dayStart } } }) : 0;

  // Personnes inscrites avant la fin de la période d'envoi, avec leurs marques et ce qui est déjà fait.
  const users = (await prisma.user.findMany({
    where: { monthlySummaryAt: { not: null, lt: now } },
    select: {
      id: true,
      email: true,
      monthlySummaryBrandIds: true,
      memberships: { select: { brandId: true, brand: { select: { createdAt: true } } } },
      monthlySummaries: { where: { month }, select: { id: true, brandId: true, status: true, attempts: true, lastAttemptAt: true } }
    },
    orderBy: { monthlySummaryAt: "asc" }
  })) as {
    id: string;
    email: string;
    monthlySummaryBrandIds: string[];
    memberships: { brandId: string; brand: { createdAt: Date } }[];
    monthlySummaries: { id: string; brandId: string; status: string; attempts: number; lastAttemptAt: Date }[];
  }[];

  let processed = 0;
  // Réussites (propres à la personne, pas à la marque) : dans un seul de ses bilans du mois.
  const reussitesGiven = new Set(users.filter((u) => u.monthlySummaries.some((s) => s.status === "SENT")).map((u) => u.id));
  for (const u of users) {
    const brands = u.memberships
      .sort((a, b) => a.brand.createdAt.getTime() - b.brand.createdAt.getTime())
      .map((m) => m.brandId)
      .filter((id) => u.monthlySummaryBrandIds.length === 0 || u.monthlySummaryBrandIds.includes(id));
    for (const brandId of brands) {
      if (processed >= perRun || Date.now() - started > TIME_BUDGET_MS) return result;
      if (sentToday >= limit) {
        result.capped = true;
        return result;
      }
      const existing = u.monthlySummaries.find((s) => s.brandId === brandId);
      let rowId: string;
      if (existing) {
        const retry = existing.status === "FAILED" && existing.attempts < MAX_ATTEMPTS && existing.lastAttemptAt.getTime() <= now.getTime() - RETRY_AFTER_MS;
        if (!retry) continue;
        const claimed = await prisma.monthlySummary.updateMany({
          where: { id: existing.id, status: "FAILED", attempts: existing.attempts },
          data: { status: "SENDING", attempts: existing.attempts + 1, lastAttemptAt: now }
        });
        if (claimed.count === 0) continue;
        rowId = existing.id;
      } else {
        try {
          rowId = (await prisma.monthlySummary.create({ data: { userId: u.id, brandId, month, status: "SENDING", lastAttemptAt: now }, select: { id: true } })).id;
        } catch {
          continue; // pris par un autre passage du cron
        }
      }
      processed++;
      const withReussites = !reussitesGiven.has(u.id);
      try {
        const out = await deliver(u.id, u.email, brandId, month, { withReussites });
        if (out.status === "SENT" && withReussites) reussitesGiven.add(u.id);
        await prisma.monthlySummary.update({
          where: { id: rowId },
          data: { status: out.status, error: out.error?.slice(0, 500) ?? null, sentAt: out.status === "SENT" ? new Date() : null, bioClicks: out.bioClicks }
        });
        if (out.status === "SENT") {
          result.sent++;
          sentToday++;
        } else if (out.status === "SKIPPED") result.skipped++;
        else result.failed++;
      } catch (err) {
        await prisma.monthlySummary.update({ where: { id: rowId }, data: { status: "FAILED", error: (err as Error).message.slice(0, 500) } }).catch(() => undefined);
        result.failed++;
      }
    }
  }
  return result;
}

/** « M'envoyer un aperçu » : bilan du mois dernier (ou de ce mois-ci) de la première marque cochée. */
export async function sendSummaryPreview(userId: string, brandId?: string, now: Date = new Date()): Promise<{ ok: true; month: MonthKey; brandId: string } | { ok: false; error: string; status: number }> {
  const [user, settings] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { email: true } }), getSummarySettings(userId)]);
  if (!user) return { ok: false, error: "Compte introuvable.", status: 404 };
  const target = brandId ?? settings.brandIds[0];
  if (!target || !settings.brands.some((b) => b.id === target)) return { ok: false, error: "Marque introuvable.", status: 404 };
  const current = monthKeyOf(now, SEND_TZ);
  for (const month of [previousMonth(current), current]) {
    const out = await deliver(userId, user.email, target, month, { withReussites: true, preview: true });
    if (out.status === "SENT") return { ok: true, month, brandId: target };
    if (out.status === "FAILED") return { ok: false, error: out.error ?? "L'e-mail n'a pas pu partir.", status: 502 };
  }
  return { ok: false, error: "Pas encore de chiffres pour cette marque : connectez un compte et actualisez vos statistiques.", status: 409 };
}
