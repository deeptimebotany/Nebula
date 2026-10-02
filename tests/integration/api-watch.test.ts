import { beforeEach, describe, expect, it, vi } from "vitest";

// Veille des API (02/10/2026), sur une vraie base : rappels d'échéance
// (une seule fois chacun), sources relues une fois par 24 h avec un point
// de départ sans alerte, annonces importantes signalées au propriétaire,
// signaux de dépréciation comptés, page d'administration réservée au
// propriétaire. Aucun appel réseau : les sources sont simulées.
const session = vi.hoisted(() => ({ userId: null as string | null, email: null as string | null }));
const pages = vi.hoisted(() => ({ body: new Map<string, string>() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId, email: session.email } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/net-safety", async (orig) => ({
  ...(await orig<typeof import("@/lib/net-safety")>()),
  fetchPublic: vi.fn(async (url: string) => {
    const body = pages.body.get(url);
    return body === undefined ? new Response("introuvable", { status: 404 }) : new Response(body, { status: 200 });
  })
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL } from "@/lib/owner";
import { checkSource, runApiWatch, runDeadlineAlerts } from "@/lib/api-watch/watcher";
import { recordApiSignal } from "@/lib/api-watch/record";
import { WATCH_SOURCES } from "@/lib/api-watch/sources";
import { GET, POST } from "@/app/api/admin/api-watch/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const NOW = new Date("2026-10-02T09:00:00Z");
const feed = (items: { id: string; title: string }[]) =>
  `<rss><channel>${items.map((i) => `<item><guid>${i.id}</guid><title>${i.title}</title><link>https://example.com/${i.id}</link></item>`).join("")}</channel></rss>`;
const page = (lines: string[]) => `<html><body><main>${lines.map((l) => `<p>${l}</p>`).join("")}</main></body></html>`;
const BASE_LINES = [
  "gemini-2.5-flash-image will be shut down on October 2, 2026.",
  "gemini-3.1-flash-image is generally available since May 28, 2026.",
  "gemini-3.8-flash is our newest stable Flash model for text.",
  "Older preview models are listed with their shutdown dates below.",
  "Migrate to the recommended replacement before the shutdown date."
];

async function owner() {
  return prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
}
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/admin/api-watch", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe.skipIf(!hasDatabase)("veille des API", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    pages.body.clear();
  });

  it("rappels d'échéance : une alerte par seuil, jamais deux fois", async () => {
    const o = await owner();
    expect(await runDeadlineAlerts(NOW)).toBe(1);
    expect(await runDeadlineAlerts(NOW)).toBe(1);
    const notes = await prisma.notification.findMany({ where: { userId: o.id, dedupeKey: { startsWith: "api-deadline:" } } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Revue à faire dans 25 jours : Meta Marketing API (Publicité Meta)", href: "/admin/api" });
    // Le cron ne refait le calcul que toutes les 12 h.
    await prisma.notification.deleteMany({});
    const first = await runApiWatch(NOW, { sources: 0, fetchText: async () => "" });
    const again = await runApiWatch(new Date(NOW.getTime() + 3_600_000), { sources: 0, fetchText: async () => "" });
    expect([first.deadlineAlerts, again.deadlineAlerts]).toEqual([1, 0]);
  });

  it("flux : premier relevé = point de départ ; ensuite, annonce importante signalée", async () => {
    const o = await owner();
    const source = WATCH_SOURCES.find((s) => s.key === "feed:resend")!;
    let xml = feed([{ id: "a", title: "New dashboard" }, { id: "b", title: "Faster emails" }]);
    expect(await checkSource(source, NOW, async () => xml)).toEqual([]);
    expect(await prisma.apiWatchItem.count({ where: { baseline: true } })).toBe(2);
    xml = feed([{ id: "c", title: "Deprecation of the v0 endpoints" }, { id: "d", title: "Templates gallery" }, { id: "a", title: "New dashboard" }]);
    const fresh = await checkSource(source, NOW, async () => xml);
    expect(fresh.map((f) => [f.externalId, f.important])).toEqual([
      ["c", true],
      ["d", false]
    ]);
    const state = await prisma.apiWatchSource.findUnique({ where: { key: source.key } });
    expect(state).toMatchObject({ lastError: null, failures: 0 });
    // Par le cron : l'annonce importante arrive dans la cloche.
    xml = feed([{ id: "e", title: "API key format change: old keys will be removed" }, ...[{ id: "c", title: "x" }]]);
    await prisma.apiWatchSource.update({ where: { key: source.key }, data: { lastCheckedAt: new Date(NOW.getTime() - 25 * 3_600_000) } });
    pages.body.set(source.url, xml);
    const run = await runApiWatch(NOW, { sources: 30, fetchText: async (url) => (url === source.url ? xml : Promise.reject(new Error("hors test"))) });
    expect(run.checked).toContain(source.key);
    const note = await prisma.notification.findFirst({ where: { userId: o.id, dedupeKey: "api-item:feed:resend:e" } });
    expect(note).toMatchObject({ title: "Annonce à lire : Changelog Resend" });
  });

  it("page sans flux : les lignes nouvelles deviennent une annonce ; injoignable : notée, sans alerte", async () => {
    const source = WATCH_SOURCES.find((s) => s.key === "page:gemini-deprecations")!;
    expect(await checkSource(source, NOW, async () => page(BASE_LINES))).toEqual([]);
    expect(await checkSource(source, NOW, async () => page(BASE_LINES))).toEqual([]);
    const fresh = await checkSource(source, NOW, async () => page([...BASE_LINES, "gemini-3.5-flash will be shut down on March 1, 2027."]));
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ title: "Gemini — modèles retirés : 1 ligne nouvelle", important: true, excerpt: "gemini-3.5-flash will be shut down on March 1, 2027." });
    await checkSource(source, NOW, async () => {
      throw new Error("délai dépassé");
    });
    await checkSource(source, NOW, async () => page(["trop court"]));
    expect(await prisma.apiWatchSource.findUnique({ where: { key: source.key } })).toMatchObject({ failures: 2, lastError: "page sans texte lisible (page dynamique ?)" });
  });

  it("signal de dépréciation : enregistré et signalé une fois, puis compté", async () => {
    const o = await owner();
    const signal = { kind: "VERSION_UPGRADED" as const, detail: "Appel en v25.0 servi en v26.0 : la version demandée n'est plus en service.", sunsetAt: null };
    await recordApiSignal("FACEBOOK", "GET graph.facebook.com/v25.0/me/accounts", "k1", signal);
    await recordApiSignal("FACEBOOK", "GET graph.facebook.com/v25.0/me/accounts", "k1", signal);
    expect(await prisma.apiSignal.findUnique({ where: { key: "k1" } })).toMatchObject({ count: 2, provider: "FACEBOOK", kind: "VERSION_UPGRADED" });
    const notes = await prisma.notification.findMany({ where: { userId: o.id, dedupeKey: { startsWith: "api-signal:" } } });
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("FACEBOOK : version d'API dépassée");
  });

  it("page d'administration : propriétaire seulement ; marquer traité ; vérifier maintenant", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    session.email = user.email;
    expect((await GET()).status).toBe(404);
    expect((await post({ action: "check-now" })).status).toBe(404);

    const o = await owner();
    session.userId = o.id;
    session.email = OWNER_EMAIL;
    await recordApiSignal("META_ADS", "GET graph.facebook.com/v25.0/act_{id}/insights", "k2", { kind: "VERSION_UPGRADED", detail: "auto-upgraded", sunsetAt: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.deadlines[0]).toMatchObject({ id: "meta-marketing", next: { kind: "revue", level: "urgent" } });
    expect(d.sources).toHaveLength(WATCH_SOURCES.length);
    expect(d.signals).toHaveLength(1);
    expect(d.announcements.length).toBeGreaterThan(5);

    expect((await post({ action: "handle", type: "signal", id: d.signals[0].id, handled: true })).status).toBe(200);
    expect((await prisma.apiSignal.findUnique({ where: { key: "k2" } }))?.handledAt).not.toBeNull();
    expect((await post({ action: "handle", type: "item", id: "inconnu", handled: true })).status).toBe(404);
    expect((await post({ action: "autre" })).status).toBe(400);

    // Vérifier maintenant : 6 sources (réseau simulé : 404 partout, sauf une).
    const first = WATCH_SOURCES[0];
    pages.body.set(first.url, feed([{ id: "z", title: "Hello" }]));
    const check = await post({ action: "check-now" });
    expect(check.status).toBe(200);
    const body = await check.json();
    expect(body.run.checked).toHaveLength(6);
    const states = body.dashboard.sources as { key: string; lastOkAt: string | null; lastError: string | null }[];
    expect(states.find((s) => s.key === first.key)?.lastOkAt).not.toBeNull();
    expect(states.filter((s) => s.lastError === "réponse 404")).toHaveLength(5);
  });
});
