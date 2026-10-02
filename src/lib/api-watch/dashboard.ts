// Tableau de bord de la veille des API (02/10/2026) : calendrier, annonces
// déjà évaluées, signaux lus dans les réponses, annonces des changelogs et
// état des sources. Serveur uniquement (lu par /api/admin/api-watch).
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { configuredModels } from "@/lib/ai/gemini";
import { deadlineStatuses } from "./deadlines";
import { KNOWN_ANNOUNCEMENTS } from "./registry";
import { WATCH_SOURCES } from "./sources";
import type { ApiWatchDashboardDTO } from "./types";

/** Valeur réglée sur le serveur quand elle diffère de la valeur par défaut. */
function configuredValue(id: string, inUse: string, envVar?: string): string | null {
  if (id === "gemini-text") return configuredModels().text !== inUse ? configuredModels().text : null;
  if (id === "gemini-image") return configuredModels().image !== inUse ? configuredModels().image : null;
  const value = envVar ? process.env[envVar]?.trim() : undefined;
  return value && value !== inUse ? value : null;
}

export async function apiWatchDashboard(now: Date = new Date()): Promise<ApiWatchDashboardDTO> {
  const [signals, items, states] = await Promise.all([
    prisma.apiSignal.findMany({ orderBy: [{ handledAt: { sort: "asc", nulls: "first" } }, { lastSeenAt: "desc" }], take: 100 }),
    prisma.apiWatchItem.findMany({ where: { baseline: false }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.apiWatchSource.findMany()
  ]);
  const labels = new Map(WATCH_SOURCES.map((s) => [s.key, s.label]));
  const stateOf = new Map(states.map((s) => [s.key, s]));
  return {
    now: now.toISOString(),
    deadlines: deadlineStatuses(now).map((d) => ({
      id: d.api.id,
      label: d.api.label,
      group: d.api.group,
      inUse: d.api.inUse,
      configured: configuredValue(d.api.id, d.api.inUse, d.api.envVar),
      envVar: d.api.envVar ?? null,
      sunset: d.api.sunset,
      sunsetNote: d.api.sunsetNote ?? null,
      reviewBy: d.api.reviewBy,
      next: { kind: d.kind, date: d.date, days: d.days, level: d.level },
      changelog: d.api.changelog,
      howTo: d.api.howTo,
      checkedAt: d.api.checkedAt
    })),
    announcements: [...KNOWN_ANNOUNCEMENTS].sort((a, b) => b.date.localeCompare(a.date)),
    signals: signals.map((s) => ({
      id: s.id,
      provider: s.provider,
      kind: s.kind,
      endpoint: s.endpoint,
      detail: s.detail,
      sunsetAt: s.sunsetAt?.toISOString() ?? null,
      firstSeenAt: s.firstSeenAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      count: s.count,
      handled: Boolean(s.handledAt)
    })),
    items: items.map((i) => ({
      id: i.id,
      sourceKey: i.sourceKey,
      sourceLabel: labels.get(i.sourceKey) ?? i.sourceKey,
      title: i.title,
      url: i.url,
      excerpt: i.excerpt,
      publishedAt: i.publishedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      important: i.important,
      handled: Boolean(i.handledAt)
    })),
    sources: WATCH_SOURCES.map((s) => {
      const st = stateOf.get(s.key);
      return {
        key: s.key,
        label: s.label,
        kind: s.kind,
        url: s.url,
        lastCheckedAt: st?.lastCheckedAt?.toISOString() ?? null,
        lastOkAt: st?.lastOkAt?.toISOString() ?? null,
        lastError: st?.lastError ?? null,
        failures: st?.failures ?? 0
      };
    }),
    emailConfigured: isEmailConfigured()
  };
}
