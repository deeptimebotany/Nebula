// Données d'une marque préparées côté serveur (lot 10).
//
// Chaque fonction est la SEULE source de sa donnée : la route d'API qui la
// sert au navigateur (`/api/connections`, `/api/analytics`…) et les pages
// rendues côté serveur (layout de l'application, Vue d'ensemble, Analytics)
// appellent la même, pour que les données préchargées soient identiques à
// celles que le navigateur recevrait. L'appartenance à la marque est
// vérifiée par l'appelant (route : requireBrandMembership ; page :
// resolveActiveBrand, qui ne renvoie qu'une marque de l'utilisateur).
import { prisma } from "@/lib/prisma";
import { isAiEnabled } from "@/lib/ai/gemini";
import { getBrandPlan } from "@/lib/billing/plan";
import { bestHourOf, MIN_SNAPSHOTS_FOR_SLOT, type HourSnapshot } from "@/lib/best-hour";
import { DEFAULT_TIMEZONE, utcToWallClock } from "@/lib/timezone";

/**
 * Forme JSON exacte d'une valeur (dates en texte ISO…), telle qu'une route
 * d'API l'enverrait : le cache du navigateur reçoit la même chose, qu'elle
 * vienne du serveur au premier affichage ou d'un appel ensuite.
 */
export function asJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const AUTO_RENEW_NETWORKS = new Set(["YOUTUBE", "TIKTOK", "PINTEREST"]);

/** Comptes connectés d'une marque (GET /api/connections). */
export async function getConnectionsList(brandId: string) {
  const connections = await prisma.socialConnection.findMany({
    where: { brandId, status: { not: "DISCONNECTED" } },
    select: {
      id: true,
      network: true,
      displayName: true,
      handle: true,
      avatarUrl: true,
      status: true,
      connectedAt: true,
      lastSyncedAt: true,
      lastError: true,
      tokenExpiresAt: true,
      refreshToken: true
    },
    orderBy: { connectedAt: "desc" }
  });
  // autoRenew : le jeton d'accès de ces réseaux ne dure que quelques heures
  // (YouTube 1 h, TikTok 24 h) ou semaines (Pinterest), mais Nebula le
  // renouvelle tout seul tant qu'il a un jeton de rafraîchissement : la page
  // Comptes ne doit donc pas afficher « expirée » d'après tokenExpiresAt.
  // Le jeton de rafraîchissement lui-même n'est jamais renvoyé au navigateur.
  return {
    connections: connections.map(({ refreshToken, ...c }: { refreshToken: string | null; network: string } & Record<string, unknown>) => ({
      ...c,
      autoRenew: Boolean(refreshToken) && AUTO_RENEW_NETWORKS.has(c.network)
    }))
  };
}

/**
 * Relevés de statistiques des comptes connectés (GET /api/analytics) : les
 * 30 derniers par compte, du plus ancien au plus récent. Lot 10 : `select`
 * au lieu de la ligne complète (les jetons n'étaient lus et déchiffrés que
 * pour être jetés).
 */
export async function getAnalyticsList(brandId: string) {
  const connections = await prisma.socialConnection.findMany({
    where: { brandId, status: "CONNECTED" },
    select: {
      id: true,
      network: true,
      displayName: true,
      handle: true,
      analytics: { orderBy: { capturedAt: "desc" }, take: 30 }
    }
  });
  return {
    connections: connections.map((c: { id: string; network: string; displayName: string; handle: string | null; analytics: unknown[] }) => ({
      id: c.id,
      network: c.network,
      displayName: c.displayName,
      handle: c.handle,
      snapshots: c.analytics.slice().reverse()
    }))
  };
}

/** IA disponible pour la marque (GET /api/ai/status). */
export async function getAiStatus(brandId: string) {
  const keyConfigured = isAiEnabled();
  const { plan, limits } = await getBrandPlan(brandId);
  return { enabled: keyConfigured && limits.aiEnabled, keyConfigured, plan, planAllowsAi: limits.aiEnabled };
}

const WEEKDAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/**
 * Widget "Insights IA" du tableau de bord (GET /api/analytics/insights) :
 * recommande de meilleurs créneaux de publication à partir de VOS VRAIES
 * données — les AnalyticsSnapshot déjà capturées (followersDelta,
 * engagementRate) et l'historique réel de vos publications
 * (Post.scheduledAt). Aucune statistique inventée : si l'historique est trop
 * court pour être significatif, on le dit clairement plutôt que d'afficher
 * un conseil générique déguisé en donnée personnelle.
 */
export async function getAnalyticsInsights(brandId: string) {
  const [brand, connections, publishedPosts] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { timezone: true } }) as Promise<{ timezone: string | null } | null>,
    prisma.socialConnection.findMany({
      where: { brandId },
      select: { id: true, network: true, analytics: { select: { capturedAt: true, followersDelta: true, engagementRate: true } } }
    }),
    prisma.post.findMany({
      where: { brandId, status: { in: ["PUBLISHED", "PARTIAL"] }, scheduledAt: { not: null } },
      select: { scheduledAt: true }
    })
  ]);

  type Snap = HourSnapshot;
  const snapshots = connections.flatMap((c: { analytics: Snap[] }) => c.analytics);

  const MIN_SNAPSHOTS = MIN_SNAPSHOTS_FOR_SLOT;
  const MIN_POSTS = 3;
  // Heures et jours dans le fuseau de la marque (avant le 27/09/2026 : celui
  // du serveur, UTC sur Vercel — voir src/lib/best-hour.ts).
  const tz = brand?.timezone || DEFAULT_TIMEZONE;
  const bestOf = (list: Snap[]) => bestHourOf(list, tz);

  // Widget "Meilleur créneau du jour" (tableau de bord) : même logique que
  // le meilleur créneau global ci-dessous, mais calculée séparément POUR
  // CHAQUE réseau connecté, à partir de son propre historique réel.
  const perNetwork = connections.map((c: { network: string; analytics: Snap[] }) => {
    if (c.analytics.length < MIN_SNAPSHOTS) {
      return { network: c.network, hasEnoughData: false, bestHour: null, sampleSize: c.analytics.length };
    }
    const best = bestOf(c.analytics);
    return { network: c.network, hasEnoughData: Boolean(best), bestHour: best?.hour ?? null, sampleSize: c.analytics.length };
  });

  // 1. Meilleur créneau selon la croissance réelle (followersDelta) autour de
  // chaque capture — regroupé par heure de la journée.
  let bestHour: number | null = null;
  let bestHourScore: number | null = null;
  if (snapshots.length >= MIN_SNAPSHOTS) {
    const best = bestOf(snapshots);
    if (best) {
      bestHour = best.hour;
      bestHourScore = Math.round(best.avg * 10) / 10;
    }
  }

  // 2. Jour de la semaine où vous publiez le plus souvent — descriptif, tiré
  // de votre propre historique réel de publications envoyées.
  let topWeekday: string | null = null;
  let topWeekdayCount = 0;
  if (publishedPosts.length >= MIN_POSTS) {
    const byDay = new Map<number, number>();
    for (const p of publishedPosts as { scheduledAt: Date | null }[]) {
      if (!p.scheduledAt) continue;
      const w = utcToWallClock(new Date(p.scheduledAt), tz);
      const d = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    let best: { day: number; count: number } | null = null;
    for (const [day, count] of Array.from(byDay)) {
      if (!best || count > best.count) best = { day, count };
    }
    if (best) {
      topWeekday = WEEKDAYS_FR[best.day];
      topWeekdayCount = best.count;
    }
  }

  return {
    hasEnoughData: bestHour !== null || topWeekday !== null,
    sampleSize: { snapshots: snapshots.length, posts: publishedPosts.length },
    minRequired: { snapshots: MIN_SNAPSHOTS, posts: MIN_POSTS },
    bestHour,
    bestHourScore,
    topWeekday,
    topWeekdayCount,
    perNetwork
  };
}

/** Page bio publiée ? (checklist de la Vue d'ensemble — lecture seule, sans créer la page). */
export async function getLinkPagePublished(brandId: string): Promise<boolean> {
  const page = await prisma.linkPage.findUnique({ where: { brandId }, select: { published: true } });
  return Boolean(page?.published);
}
