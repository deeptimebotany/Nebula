// Centre de notifications (25/09/2026) — la cloche de l'en-tête (voir
// src/components/dashboard/notification-bell.tsx et /api/notifications).
// Côté serveur uniquement : chaque événement important (publication en
// ligne ou en échec, approbation d'un client, compte à reconnecter, rappel
// de programmation, succès débloqué, parrainage, nouveauté Nebula) appelle
// notify(). Jamais bloquant : une notification qui échoue ne doit JAMAIS
// faire échouer l'action qui l'a déclenchée.
import { prisma } from "@/lib/prisma";
import { notificationDb, type NotificationRow } from "@/lib/prisma-extra";
import { NEBULA_NEWS } from "@/data/nebula-news";

export type NotificationKind =
  | "publish_ok"
  | "publish_failed"
  | "approval"
  | "reconnect"
  | "reminder"
  | "achievement"
  | "referral"
  | "news";

export type NotificationCategory = "pub" | "win" | "news";

const CATEGORY: Record<NotificationKind, NotificationCategory> = {
  publish_ok: "pub",
  publish_failed: "pub",
  approval: "pub",
  reconnect: "pub",
  reminder: "pub",
  achievement: "win",
  referral: "win",
  news: "news"
};

/** Les notifications sont gardées 90 jours (purge par le cron). */
export const NOTIFICATION_RETENTION_DAYS = 90;

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string | null;
  actionLabel?: string | null;
  // Même clé = même notification : elle est remise en haut (et redevient
  // « non lue ») au lieu d'être dupliquée.
  dedupeKey?: string | null;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function notify(userId: string, input: NotifyInput): Promise<void> {
  try {
    const data = {
      kind: input.kind,
      category: CATEGORY[input.kind],
      title: clip(input.title, 90),
      body: clip(input.body, 240),
      href: input.href ?? null,
      actionLabel: input.actionLabel ? clip(input.actionLabel, 32) : null
    };
    if (input.dedupeKey) {
      const existing = await notificationDb.findUnique({
        where: { userId_dedupeKey: { userId, dedupeKey: input.dedupeKey } }
      });
      if (existing) {
        await notificationDb.update({ where: { id: existing.id }, data: { ...data, readAt: null, createdAt: new Date() } });
        return;
      }
    }
    await notificationDb.create({ data: { ...data, userId, dedupeKey: input.dedupeKey ?? null } });
  } catch (err) {
    console.error("[notifications] échec de création :", (err as Error).message);
  }
}

/** Comme notify, mais ne fait rien si une notification avec cette clé existe déjà (pas de remise en haut). */
export async function notifyOnce(userId: string, input: NotifyInput & { dedupeKey: string }): Promise<void> {
  const existing = await notificationDb
    .findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: input.dedupeKey } } })
    .catch(() => null);
  if (!existing) await notify(userId, input);
}

export async function notifyMany(userIds: string[], input: NotifyInput): Promise<void> {
  for (const id of Array.from(new Set(userIds))) await notify(id, input);
}

/** Membres d'une marque ayant le droit d'agir (propriétaire, éditeurs). */
export async function brandEditorIds(brandId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { brandId, role: { in: ["OWNER", "EDITOR"] } },
    select: { userId: true }
  });
  return rows.map((r: { userId: string }) => r.userId);
}

/**
 * Transforme les nouveautés Nebula (src/data/nebula-news.ts) en
 * notifications pour ce compte, une seule fois chacune (dedupeKey
 * news:<id>). Seules les nouveautés publiées après la création du compte
 * (ou dans les 14 jours qui précèdent) sont proposées.
 */
export async function materializeNews(userId: string, userCreatedAt: Date): Promise<void> {
  const since = userCreatedAt.getTime() - 14 * 86_400_000;
  const retention = Date.now() - NOTIFICATION_RETENTION_DAYS * 86_400_000;
  const candidates = NEBULA_NEWS.filter((n) => {
    const t = new Date(n.date).getTime();
    return t >= since && t >= retention && t <= Date.now();
  });
  if (candidates.length === 0) return;
  const keys = candidates.map((n) => `news:${n.id}`);
  const existing = await notificationDb.findMany({ where: { userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } });
  const have = new Set(existing.map((e) => e.dedupeKey));
  for (const n of candidates) {
    const key = `news:${n.id}`;
    if (have.has(key)) continue;
    try {
      await notificationDb.create({
        data: {
          userId,
          kind: "news",
          category: "news",
          title: n.title,
          body: n.body,
          href: n.href ?? null,
          actionLabel: n.actionLabel ?? null,
          dedupeKey: key,
          createdAt: new Date(n.date)
        }
      });
    } catch {
      // Conflit d'unicité (deux onglets en même temps) : déjà créée.
    }
  }
}

export async function purgeOldNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
  const res = await notificationDb.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return res.count;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  category: string;
  title: string;
  body: string;
  href: string | null;
  actionLabel: string | null;
  read: boolean;
  createdAt: string;
}

export function toDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    body: row.body,
    href: row.href,
    actionLabel: row.actionLabel,
    read: Boolean(row.readAt),
    createdAt: new Date(row.createdAt).toISOString()
  };
}

// --- Rappel quotidien des publications programmées --------------------------

function parisDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function parisHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(date));
}

/**
 * Une fois par jour, à partir de 17 h (heure de Paris) : prévient chaque
 * auteur du nombre de ses publications programmées pour le lendemain. La
 * clé reminder:<jour> garantit un seul rappel par jour, même si le cron
 * passe plusieurs fois.
 */
export async function sendTomorrowReminders(now = new Date()): Promise<number> {
  if (parisHour(now) < 17) return 0;
  const tomorrow = parisDay(new Date(now.getTime() + 86_400_000));
  // Fenêtre large (36 h) puis filtre exact sur le jour de Paris.
  const posts = await prisma.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { gte: now, lte: new Date(now.getTime() + 36 * 3_600_000) } },
    select: { createdById: true, scheduledAt: true }
  });
  const byUser = new Map<string, Date[]>();
  for (const p of posts as { createdById: string; scheduledAt: Date | null }[]) {
    if (!p.scheduledAt || parisDay(p.scheduledAt) !== tomorrow) continue;
    const list = byUser.get(p.createdById) ?? [];
    list.push(p.scheduledAt);
    byUser.set(p.createdById, list);
  }
  let sent = 0;
  for (const [userId, dates] of Array.from(byUser.entries())) {
    const key = `reminder:${tomorrow}`;
    const already = await notificationDb.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: key } } }).catch(() => null);
    if (already) continue;
    const first = dates.sort((a, b) => a.getTime() - b.getTime())[0];
    const time = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(first);
    await notify(userId, {
      kind: "reminder",
      title: "Rappel",
      body: `${dates.length} publication${dates.length > 1 ? "s" : ""} programmée${dates.length > 1 ? "s" : ""} demain, la première à ${time}.`,
      href: "/calendar",
      actionLabel: "Voir le calendrier",
      dedupeKey: key
    });
    sent++;
  }
  return sent;
}

// --- Aide aux messages ----------------------------------------------------

const NETWORK_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  BLUESKY: "Bluesky",
  THREADS: "Threads",
  PINTEREST: "Pinterest",
  LINKEDIN: "LinkedIn"
};

export function networkLabel(network: string): string {
  return NETWORK_LABEL[network] ?? network;
}

export function listNetworks(networks: string[]): string {
  const labels = Array.from(new Set(networks.map(networkLabel)));
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

/** true si une erreur de publication ressemble à une connexion expirée ou révoquée. */
export function looksLikeAuthError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /expir|invalid[_ ]?(grant|token)|access token|oauth|unauthori[sz]ed|\b401\b|reconnect|session has been invalidated|jeton/i.test(message);
}

// --- Connexions qui vont expirer ----------------------------------------------

// Réseaux dont le jeton ne se renouvelle pas tout seul (LinkedIn : 60 jours,
// sans jeton de rafraîchissement pour les applications standard).
const NO_AUTO_REFRESH = new Set(["LINKEDIN"]);

/**
 * Prévient les éditeurs d'une marque 7 jours avant l'expiration d'une
 * connexion qui ne se renouvelle pas toute seule, puis le jour où elle
 * expire. Une seule alerte par étape et par date d'expiration.
 */
export async function remindExpiringConnections(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const rows = await prisma.socialConnection.findMany({
    where: { status: "CONNECTED", tokenExpiresAt: { not: null, lte: soon } },
    select: { id: true, brandId: true, network: true, displayName: true, tokenExpiresAt: true, refreshToken: true }
  });
  let sent = 0;
  for (const c of rows as { id: string; brandId: string; network: string; displayName: string; tokenExpiresAt: Date | null; refreshToken: string | null }[]) {
    if (!c.tokenExpiresAt) continue;
    if (c.refreshToken && !NO_AUTO_REFRESH.has(c.network)) continue;
    const expired = c.tokenExpiresAt.getTime() <= now.getTime();
    const label = networkLabel(c.network);
    const stamp = c.tokenExpiresAt.toISOString().slice(0, 10);
    const days = Math.max(1, Math.ceil((c.tokenExpiresAt.getTime() - now.getTime()) / 86_400_000));
    // Webhook connection.expired (lot 4), une seule fois par expiration :
    // import dynamique pour éviter une dépendance circulaire avec webhooks.ts.
    if (expired) {
      const firstTime = await notificationDb
        .findFirst({ where: { dedupeKey: `expiry:${c.id}:${stamp}:expired` } })
        .then((n) => !n)
        .catch(() => false);
      if (firstTime) {
        const { emitWebhookEvent } = await import("@/lib/webhooks");
        await emitWebhookEvent(c.brandId, "connection.expired", {
          connection: { id: c.id, network: c.network, name: c.displayName },
          reason: "La connexion a expiré."
        });
      }
    }
    for (const userId of await brandEditorIds(c.brandId)) {
      await notifyOnce(userId, {
        kind: "reconnect",
        title: expired ? `${label} à reconnecter` : `${label} expire bientôt`,
        body: expired
          ? `La connexion à ${label} (${c.displayName}) a expiré : les publications sur ce compte sont en pause.`
          : `La connexion à ${label} (${c.displayName}) expire dans ${days} jour${days > 1 ? "s" : ""}. Reconnectez-la en un clic pour ne rien interrompre.`,
        href: "/accounts",
        actionLabel: `Reconnecter ${label}`,
        dedupeKey: `expiry:${c.id}:${stamp}:${expired ? "expired" : "soon"}`
      });
      sent++;
    }
  }
  return sent;
}
