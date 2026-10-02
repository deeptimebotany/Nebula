// Veille des API (02/10/2026) : calendrier des échéances, signaux lus dans
// les en-têtes des réponses, lecture des flux et des pages de changelog —
// règles pures, sans base ni réseau.
import { afterEach, describe, expect, it, vi } from "vitest";

const recorded = vi.hoisted(() => ({ calls: [] as { provider: string; endpoint: string; kind: string }[] }));
vi.mock("@/lib/api-watch/record", () => ({
  recordApiSignal: vi.fn(async (provider: string, endpoint: string, _key: string, signal: { kind: string }) => {
    recorded.calls.push({ provider, endpoint, kind: signal.kind });
  })
}));

import { API_VERSIONS } from "@/lib/social/versions";
import { KNOWN_ANNOUNCEMENTS, WATCHED_APIS } from "@/lib/api-watch/registry";
import { daysLabel, daysUntil, deadlineOf, deadlineStatuses, dueDeadlineAlerts, levelOf } from "@/lib/api-watch/deadlines";
import { parseHeaderDate, requestedMetaVersion, resetSignalMemory, signalKey, signalsFromHeaders } from "@/lib/api-watch/signals";
import { WATCH_SOURCES, htmlToText, isImportant, newLines, pageLines, parseFeed, snapshotOf, SNAPSHOT_MAX_CHARS } from "@/lib/api-watch/sources";
import { sendRequest } from "@/lib/social/base";

const NOW = new Date("2026-10-02T09:00:00Z");

describe("calendrier des API", () => {
  it("registre cohérent : identifiants uniques, dates valides, revue avant la fin de vie, versions de versions.ts", () => {
    expect(new Set(WATCHED_APIS.map((a) => a.id)).size).toBe(WATCHED_APIS.length);
    for (const a of WATCHED_APIS) {
      for (const d of [a.reviewBy, a.checkedAt, ...(a.sunset ? [a.sunset] : [])]) expect(Number.isNaN(Date.parse(`${d}T00:00:00Z`)), `${a.id} ${d}`).toBe(false);
      if (a.sunset) expect(a.reviewBy < a.sunset, a.id).toBe(true);
      expect(a.changelog.startsWith("https://"), a.id).toBe(true);
      expect(a.howTo.length).toBeGreaterThan(20);
    }
    const byId = Object.fromEntries(WATCHED_APIS.map((a) => [a.id, a]));
    expect(byId["meta-graph"].inUse).toBe(API_VERSIONS.META_GRAPH.version);
    expect(byId["google-ads"].inUse).toBe(API_VERSIONS.GOOGLE_ADS.version);
    expect(byId["linkedin"].sunset).toBe("2027-07-15");
    for (const n of KNOWN_ANNOUNCEMENTS) expect(byId[n.apiId], n.title).toBeDefined();
    for (const s of WATCH_SOURCES) for (const id of s.apiIds) expect(byId[id], `${s.key} → ${id}`).toBeDefined();
  });

  it("jours restants, niveaux, échéance la plus proche", () => {
    expect(daysUntil("2026-10-27", NOW)).toBe(25);
    expect(daysUntil("2026-10-02", NOW)).toBe(0);
    expect(daysUntil("2026-09-30", NOW)).toBe(-2);
    expect([levelOf(120), levelOf(90), levelOf(30), levelOf(0), levelOf(-1)]).toEqual(["ok", "bientot", "urgent", "urgent", "depasse"]);
    expect([daysLabel(0), daysLabel(1), daysLabel(25), daysLabel(-3)]).toEqual(["aujourd'hui", "dans 1 jour", "dans 25 jours", "dépassée de 3 jours"]);
    const api = { ...WATCHED_APIS[0], reviewBy: "2027-05-01", sunset: "2027-03-01" };
    expect(deadlineOf(api, NOW)).toMatchObject({ kind: "fin", date: "2027-03-01" });
    const statuses = deadlineStatuses(NOW);
    for (let i = 1; i < statuses.length; i++) expect(statuses[i].days).toBeGreaterThanOrEqual(statuses[i - 1].days);
  });

  it("rappels : seulement le plus petit seuil franchi ; aujourd'hui, la Marketing API de Meta à 25 jours", () => {
    const alerts = dueDeadlineAlerts(NOW);
    const meta = alerts.find((a) => a.status.api.id === "meta-marketing");
    expect(meta).toMatchObject({ threshold: 30, key: "api-deadline:meta-marketing:v25.0:revue:2026-10-27:30" });
    expect(meta!.title).toBe("Revue à faire dans 25 jours : Meta Marketing API (Publicité Meta)");
    expect(meta!.body).toContain("27 octobre 2026");
    expect(alerts.filter((a) => a.status.api.id === "meta-marketing")).toHaveLength(1);
    // Aucune autre échéance à moins de 90 jours le 02/10/2026.
    expect(alerts.map((a) => a.status.api.id)).toEqual(["meta-marketing"]);
    // À 6 jours : le seuil de 7 ; le jour même : 0 ; une nouvelle version relance les rappels.
    const api = [{ ...WATCHED_APIS[0], id: "x", inUse: "v1", sunset: null, reviewBy: "2026-10-08" }];
    expect(dueDeadlineAlerts(NOW, api)[0].threshold).toBe(7);
    expect(dueDeadlineAlerts(new Date("2026-10-08T10:00:00Z"), api)[0].threshold).toBe(0);
    expect(dueDeadlineAlerts(NOW, [{ ...api[0], inUse: "v2" }])[0].key).not.toBe(dueDeadlineAlerts(NOW, api)[0].key);
    expect(dueDeadlineAlerts(NOW, [{ ...api[0], reviewBy: "2027-06-01" }])).toEqual([]);
  });
});

describe("signaux lus dans les réponses", () => {
  afterEach(() => {
    resetSignalMemory();
    recorded.calls = [];
    vi.unstubAllGlobals();
  });

  it("dates des en-têtes Deprecation (@secondes) et Sunset (date HTTP)", () => {
    expect(parseHeaderDate("@1798761599")?.toISOString()).toBe("2026-12-31T23:59:59.000Z");
    expect(parseHeaderDate("Sat, 31 Jul 2027 00:00:00 GMT")?.toISOString()).toBe("2027-07-31T00:00:00.000Z");
    expect(parseHeaderDate("n'importe quoi")).toBeNull();
    expect(parseHeaderDate(null)).toBeNull();
  });

  it("en-têtes reconnus ; réponse normale : rien", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(signalsFromHeaders("https://graph.facebook.com/v25.0/me", h({ "content-type": "application/json", "x-app-usage": "{}" }))).toEqual([]);
    const s = signalsFromHeaders(
      "https://api.example.com/v1/items",
      h({ deprecation: "@1798761599", sunset: "Sat, 31 Jul 2027 00:00:00 GMT", link: '<https://example.com/migrate>; rel="deprecation"; type="text/html"' })
    );
    expect(s.map((x) => x.kind)).toEqual(["DEPRECATION", "SUNSET"]);
    expect(s[0].detail).toBe("Deprecation: @1798761599 (2026-12-31) — https://example.com/migrate");
    expect(s[1].sunsetAt?.toISOString()).toBe("2027-07-31T00:00:00.000Z");
    expect(signalsFromHeaders("https://graph.facebook.com/v25.0/act_1/insights", h({ "x-ad-api-version-warning": "The call has been auto-upgraded to v26.0 as v25.0 has been deprecated." }))[0]).toMatchObject({ kind: "VERSION_UPGRADED" });
    expect(signalsFromHeaders("https://graph.facebook.com/v25.0/me/accounts", h({ "facebook-api-version": "v26.0" }))[0].detail).toBe("Appel en v25.0 servi en v26.0 : la version demandée n'est plus en service.");
    expect(signalsFromHeaders("https://graph.facebook.com/v25.0/me", h({ "facebook-api-version": "v25.0" }))).toEqual([]);
    expect(signalsFromHeaders("https://www.googleapis.com/youtube/v3/videos", h({ warning: '299 - "Deprecated API"' }))[0].kind).toBe("WARNING");
    expect(signalsFromHeaders("https://www.googleapis.com/youtube/v3/videos", h({ warning: '110 - "Response is stale"' }))).toEqual([]);
    expect(requestedMetaVersion("https://graph.instagram.com/v25.0/me")).toBe("v25.0");
    expect(requestedMetaVersion("https://api.tiktok.com/v25.0/x")).toBeNull();
  });

  it("clé stable : sans identifiants de compte ni chiffres variables", () => {
    const sig = { kind: "VERSION_UPGRADED" as const, detail: "auto-upgraded request 123456789", sunsetAt: null };
    expect(signalKey("META_ADS", "GET graph.facebook.com/v25.0/act_{id}/insights", sig)).toBe(signalKey("META_ADS", "GET graph.facebook.com/v25.0/act_{id}/insights", { ...sig, detail: "auto-upgraded request 987654321" }));
  });

  it("porte commune sendRequest : réponse rendue telle quelle, signal enregistré une fois, jamais de jeton", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "x-ad-api-version-warning": "auto-upgraded to v26.0" } })));
    const res = await sendRequest("META_ADS", "https://graph.facebook.com/v25.0/act_42424242/insights?access_token=SECRET");
    expect(res.status).toBe(200);
    await sendRequest("META_ADS", "https://graph.facebook.com/v25.0/act_42424242/insights?access_token=SECRET");
    await new Promise((r) => setTimeout(r, 30));
    expect(recorded.calls).toEqual([{ provider: "META_ADS", endpoint: "GET graph.facebook.com/v25.0/act_42424242/insights", kind: "VERSION_UPGRADED" }]);
    expect(JSON.stringify(recorded.calls)).not.toContain("SECRET");
  });
});

describe("flux et pages des changelogs", () => {
  it("RSS 2.0 : titre, lien, date, CDATA et entités", () => {
    const rss = `<?xml version="1.0"?><rss><channel><title>Blog</title>
      <item><title><![CDATA[Sunset of v22 &amp; more]]></title><link>https://ads-developers.googleblog.com/2026/09/x.html</link><guid isPermaLink="false">tag:1</guid><pubDate>Wed, 23 Sep 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;v22 will be &lt;b&gt;sunset&lt;/b&gt;&lt;/p&gt;</description></item>
      <item><title>Hello</title><link>javascript:alert(1)</link></item>
    </channel></rss>`;
    const entries = parseFeed(rss);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: "tag:1", title: "Sunset of v22 & more", url: "https://ads-developers.googleblog.com/2026/09/x.html", summary: "v22 will be sunset" });
    expect(entries[0].publishedAt?.toISOString()).toBe("2026-09-23T10:00:00.000Z");
    expect(entries[1].url).toBeNull();
  });

  it("Atom : lien alternate, identifiant, date de publication", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>urn:post:9</id><title type="html">New Graph API v26.0</title><link rel="alternate" href="https://developers.facebook.com/blog/post/2026/07/29/v26/"/><published>2026-07-29T16:00:00Z</published><summary>Graph API v26.0 is available.</summary></entry></feed>`;
    expect(parseFeed(atom)[0]).toMatchObject({ id: "urn:post:9", title: "New Graph API v26.0", url: "https://developers.facebook.com/blog/post/2026/07/29/v26/" });
    expect(parseFeed("<html>pas un flux</html>")).toEqual([]);
  });

  it("pages : texte utile, lignes nouvelles, taille bornée", () => {
    const html = `<html><head><script>var token="x"</script><style>p{}</style></head><body><nav>Menu</nav><main>
      <h2>September 2026</h2><p>gemini-2.5-flash-image will be shut down on October 2, 2026.</p>
      <p>Last updated 2026-10-01 UTC.</p><ul><li>Release of gemini-3.8-flash, our newest stable model.</li><li>court</li></ul></main></body></html>`;
    const lines = pageLines(html);
    expect(lines).toEqual(["gemini-2.5-flash-image will be shut down on October 2, 2026.", "Release of gemini-3.8-flash, our newest stable model."]);
    expect(htmlToText("<p>A&nbsp;&amp;&#233;</p>")).toBe("A &é");
    expect(newLines(lines, [...lines, "gemini-3.5-flash will be shut down on March 1, 2027."])).toEqual(["gemini-3.5-flash will be shut down on March 1, 2027."]);
    expect(snapshotOf(Array.from({ length: 5000 }, (_, i) => `ligne numéro ${i} `.padEnd(80, "x"))).length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS);
  });

  it("annonces importantes : retrait, fin de vie, changement cassant", () => {
    for (const t of ["v22 will be sunset", "Model deprecation", "This endpoint is no longer supported", "Breaking change in v26", "shutdown on March 1", "Fin de vie de la version"]) expect(isImportant(t), t).toBe(true);
    for (const t of ["New features in Gemini", "Introducing faster uploads", "Welcome to our blog"]) expect(isImportant(t), t).toBe(false);
  });

  it("sources : clés uniques, adresses https, flux et pages", () => {
    expect(new Set(WATCH_SOURCES.map((s) => s.key)).size).toBe(WATCH_SOURCES.length);
    for (const s of WATCH_SOURCES) expect(s.url.startsWith("https://"), s.key).toBe(true);
    expect(WATCH_SOURCES.filter((s) => s.kind === "feed")).toHaveLength(8);
    expect(WATCH_SOURCES.filter((s) => s.kind === "page")).toHaveLength(10);
  });
});
