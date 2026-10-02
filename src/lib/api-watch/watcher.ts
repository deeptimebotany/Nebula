// Tâche de la veille des API (02/10/2026), lancée par le cron des comptes
// (account-jobs.ts) à chaque passage :
//  1. rappels d'échéance (calendrier registry.ts) : au plus une fois par
//     12 h, chaque rappel ne part qu'une fois (cloche + e-mail) ;
//  2. sources officielles (sources.ts) : au plus SOURCES_PER_RUN sources par
//     passage, chacune relue une fois par 24 h. Une source est « prise » par
//     un updateMany conditionnel (deux passages du cron ne la lisent jamais
//     en même temps). Premier relevé = point de départ, sans alerte.
// Lecture par la porte commune des adresses publiques (fetchPublic : délai,
// taille plafonnée, redirections revérifiées). Une source injoignable est
// notée dans /admin/api, sans alerte (une page peut changer d'adresse).
import { prisma } from "@/lib/prisma";
import { fetchPublic, readBodyCapped } from "@/lib/net-safety";
import { dueDeadlineAlerts } from "./deadlines";
import { alertOwnerWithEmail } from "./notify";
import { WATCH_SOURCES, isImportant, newLines, pageLines, parseFeed, sha256, snapshotOf, type WatchSource } from "./sources";

const HOUR = 3_600_000;
export const SOURCE_EVERY_MS = 24 * HOUR;
export const DEADLINES_EVERY_MS = 12 * HOUR;
export const SOURCES_PER_RUN = 2;
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const DEADLINES_KEY = "job:deadlines";
const USER_AGENT = "NebulaApiWatch/1.0 (+https://nebulahub.space ; veille des changelogs officiels)";

export interface ApiWatchRun {
  deadlineAlerts: number;
  checked: string[];
  newItems: number;
  important: number;
}

/** Prend une ligne de suivi si son dernier passage est assez ancien (verrou entre instances). */
async function claim(key: string, now: Date, everyMs: number): Promise<boolean> {
  const cutoff = new Date(now.getTime() - everyMs);
  await prisma.apiWatchSource.upsert({ where: { key }, create: { key }, update: {} });
  const res = await prisma.apiWatchSource.updateMany({
    where: { key, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
    data: { lastCheckedAt: now }
  });
  return res.count === 1;
}

export async function runDeadlineAlerts(now: Date = new Date()): Promise<number> {
  const alerts = dueDeadlineAlerts(now);
  for (const a of alerts) await alertOwnerWithEmail({ title: a.title, body: a.body, dedupeKey: a.key });
  return alerts.length;
}

async function download(url: string): Promise<string> {
  const res = await fetchPublic(url, { timeoutMs: TIMEOUT_MS, headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5" } });
  if (!res.ok) throw new Error(`réponse ${res.status}`);
  return (await readBodyCapped(res, MAX_BYTES)).toString("utf8");
}

interface NewItem {
  externalId: string;
  title: string;
  url: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
  important: boolean;
}

function feedItems(source: WatchSource, body: string): NewItem[] {
  const entries = parseFeed(body);
  if (entries.length === 0) throw new Error("flux vide ou illisible");
  return entries
    .filter((e) => !source.filter || source.filter.test(`${e.title} ${e.summary}`))
    .slice(0, 50)
    .map((e) => ({ externalId: e.id, title: e.title, url: e.url, excerpt: e.summary || null, publishedAt: e.publishedAt, important: isImportant(`${e.title} ${e.summary}`) }));
}

async function noteFailure(key: string, err: unknown): Promise<void> {
  const lastError = ((err as Error)?.message ?? String(err)).slice(0, 300);
  await prisma.apiWatchSource.upsert({ where: { key }, create: { key, lastError, failures: 1 }, update: { lastError, failures: { increment: 1 } } });
}

/** Relève une source ; renvoie les annonces nouvelles (hors point de départ). */
export async function checkSource(source: WatchSource, now: Date = new Date(), fetchText: (url: string) => Promise<string> = download): Promise<NewItem[]> {
  const state = await prisma.apiWatchSource.findUnique({ where: { key: source.key } });
  const firstRun = !state?.lastOkAt;
  let body: string;
  try {
    body = await fetchText(source.url);
  } catch (err) {
    await noteFailure(source.key, err);
    return [];
  }

  let items: NewItem[] = [];
  let snapshot: string | null = state?.snapshot ?? null;
  let hash: string | null = state?.contentHash ?? null;
  try {
    if (source.kind === "feed") {
      items = feedItems(source, body);
    } else {
      const lines = pageLines(body);
      if (lines.length < 5) throw new Error("page sans texte lisible (page dynamique ?)");
      const next = snapshotOf(lines);
      const nextHash = sha256(next);
      if (!firstRun && nextHash !== hash) {
        const added = newLines(state?.snapshot ? state.snapshot.split("\n") : [], lines);
        if (added.length > 0) {
          const text = added.join(" ");
          items = [
            {
              externalId: nextHash.slice(0, 40),
              title: `${source.label} : ${added.length} ligne${added.length > 1 ? "s" : ""} nouvelle${added.length > 1 ? "s" : ""}`,
              url: source.url,
              excerpt: added.slice(0, 6).join("\n").slice(0, 1200),
              publishedAt: now,
              important: isImportant(text)
            }
          ];
        }
      }
      snapshot = next;
      hash = nextHash;
    }
  } catch (err) {
    await noteFailure(source.key, err);
    return [];
  }

  const fresh: NewItem[] = [];
  for (const item of items) {
    try {
      await prisma.apiWatchItem.create({
        data: {
          sourceKey: source.key,
          externalId: item.externalId,
          title: item.title,
          url: item.url,
          excerpt: item.excerpt,
          publishedAt: item.publishedAt,
          important: item.important,
          baseline: firstRun
        }
      });
      if (!firstRun) fresh.push(item);
    } catch {
      // déjà connue
    }
  }
  const ok = { lastOkAt: now, lastError: null, failures: 0, contentHash: hash, snapshot };
  await prisma.apiWatchSource.upsert({ where: { key: source.key }, create: { key: source.key, lastCheckedAt: now, ...ok }, update: ok });
  return fresh;
}

async function alertItems(source: WatchSource, items: NewItem[]): Promise<void> {
  for (const item of items.filter((i) => i.important)) {
    await alertOwnerWithEmail({
      title: `Annonce à lire : ${source.label}`,
      body: `${item.title}${item.excerpt ? ` — ${item.excerpt.replace(/\n/g, " ").slice(0, 220)}` : ""}${item.url ? ` (${item.url})` : ""}`,
      dedupeKey: `api-item:${source.key}:${item.externalId}`.slice(0, 180)
    });
  }
}

/**
 * Un passage du cron : échéances (toutes les 12 h) et 2 sources au plus.
 * `force` (bouton « Vérifier maintenant » de /admin/api) : échéances et les
 * `sources` sources relues le moins récemment, sans attendre 24 h.
 */
export async function runApiWatch(now: Date = new Date(), opts: { sources?: number; force?: boolean; fetchText?: (url: string) => Promise<string> } = {}): Promise<ApiWatchRun> {
  const run: ApiWatchRun = { deadlineAlerts: 0, checked: [], newItems: 0, important: 0 };
  // Une seule lecture quand rien n'est à faire (cas de presque tous les passages du cron).
  const states = await prisma.apiWatchSource.findMany({ select: { key: true, lastCheckedAt: true } });
  const last = new Map(states.map((st) => [st.key, st.lastCheckedAt?.getTime() ?? 0]));
  const due = (key: string, everyMs: number) => (last.get(key) ?? 0) < now.getTime() - everyMs;

  if (opts.force || (due(DEADLINES_KEY, DEADLINES_EVERY_MS) && (await claim(DEADLINES_KEY, now, DEADLINES_EVERY_MS)))) run.deadlineAlerts = await runDeadlineAlerts(now);

  const limit = opts.sources ?? SOURCES_PER_RUN;
  const order = opts.force ? [...WATCH_SOURCES].sort((a, b) => (last.get(a.key) ?? 0) - (last.get(b.key) ?? 0)) : WATCH_SOURCES.filter((src) => due(src.key, SOURCE_EVERY_MS));
  for (const source of order) {
    if (run.checked.length >= limit) break;
    if (opts.force) await prisma.apiWatchSource.upsert({ where: { key: source.key }, create: { key: source.key, lastCheckedAt: now }, update: { lastCheckedAt: now } });
    else if (!(await claim(source.key, now, SOURCE_EVERY_MS))) continue;
    run.checked.push(source.key);
    const fresh = await checkSource(source, now, opts.fetchText);
    run.newItems += fresh.length;
    run.important += fresh.filter((i) => i.important).length;
    await alertItems(source, fresh);
  }
  return run;
}
