// Plafond TikTok des comptes qui publient (06/10/2026).
//
// TikTok limite le nombre de comptes TikTok DIFFÉRENTS qui publient par une
// même application sur 24 heures (100 pour Nebula, réglable par
// TIKTOK_DAILY_PUBLISHER_CAP). Au-delà, TikTok refuse les publications des
// nouveaux comptes (« reached_active_user_cap ») jusqu'au lendemain.
//
//  - Chaque publication acceptée par TikTok (ouverture de l'envoi) note le
//    compte (open_id) et l'heure : le nombre de comptes sur 24 h glissantes
//    se lit sur TiktokPublisher.lastAt. Le pic du jour (UTC) est gardé dans
//    TiktokPublisherDay pour le « maximum des 30 derniers jours ».
//  - Dès que ce nombre atteint le seuil d'alerte (70 % du plafond par défaut,
//    TIKTOK_PUBLISHER_ALERT_AT), le propriétaire est prévenu dans la cloche
//    et par e-mail, une fois par jour, avec le chiffre du jour et le maximum
//    des 30 jours précédents.
//  - Si TikTok renvoie quand même l'erreur du plafond, une seconde alerte
//    part (une fois par jour) ; la personne voit un message clair (voir
//    tiktok-errors.ts).
// Jamais bloquant : une erreur ici ne fait jamais échouer une publication.
import { prisma } from "@/lib/prisma";
import { alertOwnerWithEmail } from "@/lib/api-watch/notify";

const DAY_MS = 24 * 60 * 60 * 1000;
export const TIKTOK_CAP_HREF = "/admin/reseaux";
const DEFAULT_CAP = 100;
const DEFAULT_ALERT_RATIO = 0.7;
const TIKTOK_EMAIL = {
  actionLabel: "Voir les réseaux",
  button: "Ouvrir la page Réseaux",
  footer: "E-mail réservé au propriétaire de Nebula : suivi du plafond de comptes TikTok qui publient via Nebula sur 24 heures."
};

type Env = Record<string, string | undefined>;

/** Plafond de TikTok (comptes différents par 24 h). */
export function tiktokPublisherCap(env: Env = process.env): number {
  const v = Number(env.TIKTOK_DAILY_PUBLISHER_CAP);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : DEFAULT_CAP;
}

/** Seuil d'alerte : TIKTOK_PUBLISHER_ALERT_AT, sinon 70 % du plafond (70 pour 100). */
export function tiktokAlertThreshold(env: Env = process.env): number {
  const cap = tiktokPublisherCap(env);
  const v = Number(env.TIKTOK_PUBLISHER_ALERT_AT);
  if (Number.isFinite(v) && v >= 1) return Math.min(Math.floor(v), cap);
  return Math.max(1, Math.ceil(cap * DEFAULT_ALERT_RATIO));
}

/** Jour UTC « AAAA-MM-JJ ». */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface TiktokCapStats {
  /** Comptes TikTok différents qui ont publié sur les dernières 24 h. */
  last24h: number;
  cap: number;
  alertAt: number;
  /** Plus haut pic des 30 jours précédents (aujourd'hui exclu). */
  max30: { peak: number; day: string } | null;
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).replace(/^1 /, "1er ");
}

function max30Text(s: TiktokCapStats): string {
  return s.max30 ? `${s.max30.peak} compte${s.max30.peak > 1 ? "s" : ""}, le ${dayLabel(s.max30.day)}` : "aucune publication TikTok";
}

/** Titre et texte des deux alertes (seuil approché, plafond atteint). */
export function capAlertText(kind: "threshold" | "reached", s: TiktokCapStats): { title: string; body: string } {
  const comptes = `${s.last24h} compte${s.last24h > 1 ? "s" : ""} TikTok différent${s.last24h > 1 ? "s" : ""}`;
  if (kind === "threshold") {
    return {
      title: `TikTok : ${s.last24h} comptes ont publié sur 24 h (plafond : ${s.cap})`,
      body:
        `Aujourd'hui : ${comptes} ont publié via Nebula sur les dernières 24 heures, pour un plafond TikTok de ${s.cap}. ` +
        `Maximum des 30 derniers jours : ${max30Text(s)}. ` +
        `Au-delà du plafond, TikTok refuse les publications des nouveaux comptes jusqu'au lendemain : si la hausse continue, demandez à TikTok d'augmenter la limite (support du portail des développeurs).`
    };
  }
  return {
    title: `TikTok a refusé une publication : plafond de ${s.cap} comptes atteint`,
    body:
      `TikTok a répondu « reached_active_user_cap » : le nombre de comptes qui peuvent publier via Nebula sur 24 heures est atteint. ` +
      `Les personnes concernées voient un message clair et peuvent relancer leur publication le lendemain. ` +
      `Comptés par Nebula sur les dernières 24 heures : ${comptes}. Maximum des 30 derniers jours : ${max30Text(s)}.`
  };
}

/** Chiffres du moment : comptes sur 24 h, plafond, seuil, pic des 30 jours précédents. */
export async function tiktokCapStats(now: Date = new Date()): Promise<TiktokCapStats> {
  const today = utcDay(now);
  const from = utcDay(new Date(now.getTime() - 30 * DAY_MS));
  const [last24h, top] = await Promise.all([
    prisma.tiktokPublisher.count({ where: { lastAt: { gt: new Date(now.getTime() - DAY_MS) } } }),
    prisma.tiktokPublisherDay.findFirst({ where: { day: { gte: from, lt: today } }, orderBy: [{ peak: "desc" }, { day: "desc" }] })
  ]);
  return { last24h, cap: tiktokPublisherCap(), alertAt: tiktokAlertThreshold(), max30: top ? { peak: top.peak, day: top.day } : null };
}

/**
 * Publication acceptée par TikTok pour ce compte (open_id) : met à jour le
 * compteur, le pic du jour et, au seuil, prévient le propriétaire. Renvoie
 * le nombre de comptes sur 24 h (null si l'enregistrement a échoué).
 */
export async function recordTiktokPublisher(accountId: string, now: Date = new Date()): Promise<number | null> {
  if (!accountId) return null;
  try {
    await prisma.tiktokPublisher.upsert({ where: { accountId }, create: { accountId, lastAt: now }, update: { lastAt: now } });
    const last24h = await prisma.tiktokPublisher.count({ where: { lastAt: { gt: new Date(now.getTime() - DAY_MS) } } });
    const day = utcDay(now);
    await prisma.tiktokPublisherDay.upsert({ where: { day }, create: { day, peak: last24h, peakAt: now }, update: {} });
    await prisma.tiktokPublisherDay.updateMany({ where: { day, peak: { lt: last24h } }, data: { peak: last24h, peakAt: now } });
    if (last24h >= tiktokAlertThreshold()) {
      const text = capAlertText("threshold", await tiktokCapStats(now));
      await alertOwnerWithEmail({ ...text, dedupeKey: `tiktok-cap:seuil:${day}`, href: TIKTOK_CAP_HREF, subject: text.title, ...TIKTOK_EMAIL });
    }
    return last24h;
  } catch (err) {
    console.error("[plafond TikTok]", (err as Error).message);
    return null;
  }
}

/** TikTok a renvoyé « reached_active_user_cap » : alerte au propriétaire (une fois par jour). */
export async function noteTiktokCapReached(now: Date = new Date()): Promise<void> {
  try {
    const text = capAlertText("reached", await tiktokCapStats(now));
    await alertOwnerWithEmail({ ...text, dedupeKey: `tiktok-cap:atteint:${utcDay(now)}`, href: TIKTOK_CAP_HREF, subject: text.title, ...TIKTOK_EMAIL });
  } catch (err) {
    console.error("[plafond TikTok]", (err as Error).message);
  }
}

/** Purge : comptes sans publication depuis 60 jours, pics de plus de 400 jours. */
export async function purgeTiktokPublishers(now: Date = new Date()): Promise<number> {
  const [a, b] = await Promise.all([
    prisma.tiktokPublisher.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - 60 * DAY_MS) } } }),
    prisma.tiktokPublisherDay.deleteMany({ where: { day: { lt: utcDay(new Date(now.getTime() - 400 * DAY_MS)) } } })
  ]);
  return a.count + b.count;
}
