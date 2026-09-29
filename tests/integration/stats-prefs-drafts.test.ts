import { beforeEach, describe, expect, it, vi } from "vitest";

// 29/09/2026, sur une vraie base : accord facultatif aux statistiques
// anonymes (seuil de 20 comptes), préférences d'affichage et brouillon du
// Composer enregistrés dans le compte.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUT as putConsent } from "@/app/api/settings/stats-consent/route";
import { PATCH as patchPrefs } from "@/app/api/me/prefs/route";
import { DELETE as deleteDraft, GET as getDraft, PUT as putDraft } from "@/app/api/composer/draft/route";
import { computeAnonStats, periodOf } from "@/lib/anon-stats/load";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

function req(url: string, body?: unknown, method = "PUT") {
  return new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function seedAccounts(n: number, consent: boolean) {
  const scheduledAt = new Date(Date.UTC(2026, 8, 15, 16, 0)); // mardi 15/09, 18 h à Paris
  for (let i = 0; i < n; i++) {
    const { user, brand } = await makeBrand();
    await prisma.user.update({ where: { id: user.id }, data: { statsConsent: consent, statsConsentAt: new Date() } });
    const conn = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: `ig${i}-${Date.now()}`, displayName: "Compte", accessToken: "AT" } });
    await prisma.post.create({
      data: { brandId: brand.id, createdById: user.id, caption: "Nouveauté #cafe #latte", status: "SCHEDULED", scheduledAt, targets: { create: { connectionId: conn.id, network: "INSTAGRAM" } } }
    });
    // Donnée d'API qui ne doit JAMAIS être lue.
    await prisma.postMetric.create({ data: { connectionId: conn.id, network: "INSTAGRAM", postExternalId: `m${i}`, views: 999_999, publishedAt: scheduledAt } });
  }
}

describe.skipIf(!hasDatabase)("statistiques anonymes", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("accord donné puis retiré, daté", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    expect((await putConsent(req("/api/settings/stats-consent", { consent: true }))).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ statsConsent: true });
    await putConsent(req("/api/settings/stats-consent", { consent: false }));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.statsConsent).toBe(false);
    expect(after.statsConsentAt).not.toBeNull();
  });

  it("19 comptes consentants : rien ; 20 : chiffres de groupe ; les refus ne comptent pas", async () => {
    const period = periodOf(new Date(Date.UTC(2026, 8, 15)));
    await seedAccounts(19, true);
    await seedAccounts(30, false);
    expect(await computeAnonStats(period)).toEqual({ cells: 0 });
    await seedAccounts(1, true);
    const { cells } = await computeAnonStats(period);
    expect(cells).toBeGreaterThan(0);
    const rows = await prisma.anonStat.findMany({ where: { period } });
    expect(rows.every((r) => r.sampleAccounts >= 20)).toBe(true);
    expect(rows.find((r) => r.metric === "publications.creneau")).toMatchObject({ dimension: "mardi|18-21h", value: 100, sampleAccounts: 20 });
    expect(rows.find((r) => r.metric === "publications.hashtags_median")).toMatchObject({ dimension: "INSTAGRAM", value: 2 });
    // Aucune trace des chiffres d'API (999 999 vues).
    expect(rows.some((r) => r.value === 999_999)).toBe(false);
    // Un retrait fait disparaître les chiffres au calcul suivant.
    const one = await prisma.user.findFirstOrThrow({ where: { statsConsent: true } });
    await prisma.user.update({ where: { id: one.id }, data: { statsConsent: false } });
    expect(await computeAnonStats(period)).toEqual({ cells: 0 });
  });
});

describe.skipIf(!hasDatabase)("préférences et brouillon dans le compte", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("préférences : liste fermée, fusion, suppression", async () => {
    const { user } = await makeBrand();
    session.userId = user.id;
    expect((await patchPrefs(req("/api/me/prefs", { changes: { "nebula:calendar-view": "week", "nebula:sidebar-collapsed": "1" } }, "PATCH"))).status).toBe(200);
    expect((await patchPrefs(req("/api/me/prefs", { changes: { "nebula:inconnue": "x" } }, "PATCH"))).status).toBe(400);
    await patchPrefs(req("/api/me/prefs", { changes: { "nebula:sidebar-collapsed": null } }, "PATCH"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).uiPrefs).toEqual({ "nebula:calendar-view": "week" });
  });

  it("brouillon : membres seulement, enregistré puis effacé", async () => {
    const { user, brand } = await makeBrand();
    const outsider = await makeBrand();
    session.userId = outsider.user.id;
    expect((await putDraft(req("/api/composer/draft", { brandId: brand.id, draft: { caption: "intrus" } }))).status).toBe(404);
    session.userId = user.id;
    expect((await putDraft(req("/api/composer/draft", { brandId: brand.id, draft: { title: "T", caption: "Bonjour", selectedNetworks: ["YOUTUBE"], savedAt: 5 } }))).status).toBe(200);
    const got = await (await getDraft(req(`/api/composer/draft?brandId=${brand.id}`, undefined, "GET"))).json();
    expect(got.draft).toMatchObject({ title: "T", caption: "Bonjour", selectedNetworks: ["YOUTUBE"], savedAt: 5 });
    await deleteDraft(req(`/api/composer/draft?brandId=${brand.id}`, undefined, "DELETE"));
    expect((await (await getDraft(req(`/api/composer/draft?brandId=${brand.id}`, undefined, "GET"))).json()).draft).toBeNull();
  });
});
