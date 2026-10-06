import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bilan du mois (03/10/2026), sur une vraie base, Resend simulé :
//  - calcul à partir des relevés (YouTube : fin moins début du mois) ;
//  - envoi le 3 à 9 h, un e-mail par marque cochée, une seule fois,
//    désinscription en un clic dans les en-têtes, plafond du jour, marque
//    sans données ignorée, nouvel essai après un refus ;
//  - réglages, aperçu, désinscription, page Analytics réservée aux membres ;
//  - relevé de fin de mois des comptes inscrits ; vues des Rapports clients.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadMonthlySummary } from "@/lib/monthly-summary/data";
import { runMonthlySummaries, summaryUnsubscribeToken, verifySummaryUnsubscribeToken } from "@/lib/monthly-summary/send";
import { GET as getSettings, PATCH as patchSettings } from "@/app/api/monthly-summary/settings/route";
import { POST as postPreview } from "@/app/api/monthly-summary/preview/route";
import { GET as getSummary } from "@/app/api/monthly-summary/route";
import { GET as unsubPage, POST as unsubPost } from "@/app/api/email/bilan/unsubscribe/route";
import { computeReportData } from "@/lib/reports";
import { dueConnections } from "@/lib/social/auto-sync";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const SEND_AT = new Date("2026-10-03T07:05:00Z"); // 9 h 05 à Paris
const json = (body: unknown, method = "PATCH") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

async function seedBrand(name = "Studio Nova") {
  const { user, brand } = await makeBrand();
  await prisma.brand.update({ where: { id: brand.id }, data: { name } });
  const conn = (network: string) =>
    prisma.socialConnection.create({ data: { brandId: brand.id, network, externalAccountId: `${network}-${brand.id}`, displayName: network, handle: network.toLowerCase(), accessToken: "t", status: "CONNECTED" } });
  const ig = await conn("INSTAGRAM");
  const yt = await conn("YOUTUBE");
  const snap = (connectionId: string, iso: string, followers: number, impressions: number) => prisma.analyticsSnapshot.create({ data: { connectionId, network: "X", capturedAt: new Date(iso), followers, impressions } });
  await snap(ig.id, "2026-08-31T12:00:00Z", 1_000, 300);
  await snap(ig.id, "2026-09-15T12:00:00Z", 1_080, 900);
  await snap(ig.id, "2026-09-30T12:00:00Z", 1_100, 400);
  await snap(yt.id, "2026-08-31T12:00:00Z", 200, 50_000);
  await snap(yt.id, "2026-09-15T12:00:00Z", 210, 51_000);
  await snap(yt.id, "2026-09-30T12:00:00Z", 240, 52_500);
  await prisma.postMetric.create({ data: { connectionId: ig.id, network: "INSTAGRAM", postExternalId: "ig-1", title: "Latte art", publishedAt: new Date("2026-09-14T16:00:00Z"), views: 4_000, likes: 300, comments: 12 } });
  return { user, brand, ig, yt };
}

function mailbox(status = 200) {
  return installNetwork([{ method: "POST", url: "api.resend.com/emails", status, body: status === 200 ? { id: "email-1" } : { name: "internal_server_error", message: "Resend en panne" } }]);
}

describe.skipIf(!hasDatabase)("bilan du mois", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEXTAUTH_SECRET = "secret-de-test-assez-long-pour-hkdf-0123456789";
    process.env.NEXTAUTH_URL = "https://nebulahub.space";
    delete process.env.MONTHLY_SUMMARY_DAILY_LIMIT;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  it("calcul : vrais chiffres par réseau (YouTube = fin moins début du mois)", async () => {
    const { user, brand } = await seedBrand();
    const d = (await loadMonthlySummary(brand.id, "2026-09", { userId: user.id }))!;
    expect(d.followers).toMatchObject({ total: 1_340, gain: 140 });
    expect(d.views.rows.find((r) => r.network === "YOUTUBE")?.total).toBe(2_500);
    expect(d.views.rows.find((r) => r.network === "INSTAGRAM")?.total).toBe(1_300);
    expect(d.top[0]).toMatchObject({ title: "Latte art", views: 4_000, interactions: 312 });
    // Rapports clients : le compteur total de YouTube n'est plus additionné jour après jour.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T00:00:00Z") });
    try {
      const report = await computeReportData(brand.id, 30);
      // Instagram 900 + 400 par jour ; YouTube 52 500 − 50 000 (avant : 51 000 + 52 500 additionnés).
      expect(report.totals.impressions).toBe(1_300 + 2_500);
    } finally {
      vi.useRealTimers();
    }
  });

  it("envoi : le 3 à 9 h, une fois par marque cochée, désinscription en un clic", async () => {
    const { user, brand } = await seedBrand();
    const second = await makeBrand();
    await prisma.membership.create({ data: { userId: user.id, brandId: second.brand.id, role: "OWNER" } });
    await prisma.user.update({ where: { id: user.id }, data: { monthlySummaryAt: new Date("2026-09-01T00:00:00Z") } });
    const net = mailbox();

    expect(await runMonthlySummaries(new Date("2026-10-03T06:55:00Z"))).toMatchObject({ month: null, sent: 0 });
    expect(net.sent).toHaveLength(0);

    const r = await runMonthlySummaries(SEND_AT);
    expect(r).toMatchObject({ month: "2026-09", sent: 1, skipped: 1 });
    expect(net.sent).toHaveLength(1);
    const body = net.sent[0].json as { to: string; subject: string; html: string; text: string; headers: Record<string, string> };
    expect(body.to).toBe(user.email);
    expect(body.subject).toBe("Studio Nova · votre bilan de septembre : +140 abonnés");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const token = /token=([^>&"]+)/.exec(body.headers["List-Unsubscribe"])?.[1] ?? "";
    expect(verifySummaryUnsubscribeToken(decodeURIComponent(token))).toBe(user.id);
    expect(net.sent[0].headers["idempotency-key"] ?? net.sent[0].headers["Idempotency-Key"]).toBeTruthy();
    const rows = await prisma.monthlySummary.findMany({ where: { userId: user.id }, orderBy: { status: "asc" } });
    expect(rows.map((x) => [x.brandId === brand.id ? "nova" : "vide", x.status])).toEqual([
      ["nova", "SENT"],
      ["vide", "SKIPPED"]
    ]);

    // Deuxième passage : rien de plus.
    expect(await runMonthlySummaries(new Date(SEND_AT.getTime() + 60_000))).toMatchObject({ sent: 0 });
    expect(net.sent).toHaveLength(1);
  });

  it("seulement les personnes inscrites et les marques cochées ; plafond du jour", async () => {
    const a = await seedBrand("Marque A");
    const b = await seedBrand("Marque B");
    await seedBrand("Pas inscrite");
    await prisma.membership.create({ data: { userId: a.user.id, brandId: b.brand.id, role: "EDITOR" } });
    await prisma.user.update({ where: { id: a.user.id }, data: { monthlySummaryAt: new Date("2026-09-01T00:00:00Z"), monthlySummaryBrandIds: [b.brand.id] } });
    const net = mailbox();
    await runMonthlySummaries(SEND_AT);
    expect(net.sent.map((s) => (s.json as { subject: string }).subject)).toEqual(["Marque B · votre bilan de septembre : +140 abonnés"]);

    // Plafond : 1 par jour.
    await prisma.user.update({ where: { id: a.user.id }, data: { monthlySummaryBrandIds: [] } });
    process.env.MONTHLY_SUMMARY_DAILY_LIMIT = "1";
    const r = await runMonthlySummaries(new Date(SEND_AT.getTime() + 60_000));
    expect(r).toMatchObject({ sent: 0, capped: true });
    process.env.MONTHLY_SUMMARY_DAILY_LIMIT = "0";
    expect(await runMonthlySummaries(new Date(SEND_AT.getTime() + 120_000))).toMatchObject({ sent: 1 });
  });

  it("refus de Resend : nouvel essai 2 h plus tard, 3 essais au plus", async () => {
    const { user } = await seedBrand();
    await prisma.user.update({ where: { id: user.id }, data: { monthlySummaryAt: new Date("2026-09-01T00:00:00Z") } });
    mailbox(500);
    expect(await runMonthlySummaries(SEND_AT)).toMatchObject({ failed: 1 });
    expect(await runMonthlySummaries(new Date(SEND_AT.getTime() + 30 * 60_000))).toMatchObject({ failed: 0, sent: 0 });
    const net = mailbox();
    expect(await runMonthlySummaries(new Date(SEND_AT.getTime() + 2 * 3_600_000 + 60_000))).toMatchObject({ sent: 1 });
    expect(net.sent).toHaveLength(1);
    expect(await prisma.monthlySummary.findFirst({ where: { userId: user.id } })).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("réglages, aperçu et page : seulement ses propres marques", async () => {
    const { user, brand } = await seedBrand();
    const other = await seedBrand("Autre client");
    session.userId = user.id;
    expect(await (await getSettings()).json()).toMatchObject({ enabled: false, brandIds: [brand.id] });
    const res = await patchSettings(new NextRequest("http://localhost/api/monthly-summary/settings", json({ enabled: true, brandIds: [brand.id, other.brand.id] })));
    expect(await res.json()).toMatchObject({ enabled: true, brandIds: [brand.id] });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).monthlySummaryAt).not.toBeNull();
    expect((await patchSettings(new NextRequest("http://localhost/api/monthly-summary/settings", json({ brandIds: [other.brand.id] })))).status).toBe(400);

    const net = mailbox();
    const preview = await postPreview(new NextRequest("http://localhost/api/monthly-summary/preview", json({}, "POST")));
    expect(preview.status).toBe(200);
    expect((net.sent[0].json as { to: string; subject: string }).to).toBe(user.email);
    expect((net.sent[0].json as { subject: string }).subject).toMatch(/^\[Aperçu\] Studio Nova · votre bilan de septembre/);
    expect((await postPreview(new NextRequest("http://localhost/api/monthly-summary/preview", json({ brandId: other.brand.id }, "POST")))).status).toBe(429);

    const page = await getSummary(new NextRequest(`http://localhost/api/monthly-summary?brandId=${brand.id}&month=2026-09`));
    const payload = (await page.json()) as { data: { month: string; followers: { gain: number } }; months: string[] };
    expect(payload.data).toMatchObject({ month: "2026-09", followers: { gain: 140 } });
    expect(payload.months).toContain("2026-09");
    expect((await getSummary(new NextRequest(`http://localhost/api/monthly-summary?brandId=${other.brand.id}`))).status).toBe(404);
  });

  it("désinscription par le lien : page de confirmation, puis désinscrit ; lien altéré refusé", async () => {
    const { user } = await seedBrand();
    await prisma.user.update({ where: { id: user.id }, data: { monthlySummaryAt: new Date() } });
    const token = summaryUnsubscribeToken(user.id);
    const url = `http://localhost/api/email/bilan/unsubscribe?token=${encodeURIComponent(token)}`;
    const confirm = await unsubPage(new NextRequest(url));
    expect(await confirm.text()).toContain("Me désinscrire");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).monthlySummaryAt).not.toBeNull();
    expect((await unsubPost(new NextRequest(url, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).monthlySummaryAt).toBeNull();
    expect((await unsubPost(new NextRequest(`http://localhost/api/email/bilan/unsubscribe?token=${encodeURIComponent(token)}x`, { method: "POST" }))).status).toBe(400);
  });

  it("relevé de fin de mois : les comptes d'une personne inscrite, même absente depuis 30 jours", async () => {
    const { user, ig } = await seedBrand();
    await prisma.user.update({ where: { id: user.id }, data: { reussitesCheckedAt: new Date("2026-08-01T00:00:00Z"), monthlySummaryAt: new Date("2026-08-01T00:00:00Z") } });
    const ids = async (iso: string) => (await dueConnections(new Date(iso), 10)).map((c: { id: string }) => c.id);
    expect(await ids("2026-10-01T10:00:00Z")).toContain(ig.id);
    expect(await ids("2026-10-10T10:00:00Z")).not.toContain(ig.id);
  });
});
