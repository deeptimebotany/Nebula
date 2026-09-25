import { beforeEach, describe, expect, it, vi } from "vitest";

// Synchro des comptes publicitaires face à une réponse suspecte (lot 8) :
// jamais d'effacement des dépenses déjà enregistrées.
const fake = vi.hoisted(() => ({ report: null as null | { days: unknown[]; campaigns: unknown[] }, error: null as Error | null }));
vi.mock("@/lib/ads/index", () => ({
  getAdsClient: () => ({
    authUrl: () => "",
    connect: async () => ({ tokens: { accessToken: "t" }, accounts: [] }),
    freshToken: async () => null,
    async report() {
      if (fake.error) throw fake.error;
      return fake.report ?? { days: [], campaigns: [] };
    }
  })
}));

import { prisma } from "@/lib/prisma";
import { syncAdAccount } from "@/lib/ads/sync";
import { AdsError } from "@/lib/ads/types";
import { adAccountDb, adMetricDailyDb } from "@/lib/prisma-extra";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

async function setup() {
  const { brand } = await makeBrand();
  const account = await adAccountDb.create({
    data: {
      brandId: brand.id,
      platform: "GOOGLE_ADS",
      externalId: "1234567890",
      name: "Café Nebula",
      accessToken: "tok",
      lastSyncedAt: new Date(Date.now() - DAY),
      campaigns: JSON.stringify([{ id: "111", name: "Automne", status: "Active", spend: 42, impressions: 1, clicks: 1, conversions: 0 }])
    }
  });
  const recorded = new Date(today().getTime() - 3 * DAY);
  await adMetricDailyDb.create({ data: { adAccountId: account.id, date: recorded, spend: 42.5, impressions: 1000, clicks: 20, conversions: 1 } });
  return { account, recorded };
}
const spendOn = async (adAccountId: string, date: Date) => (await adMetricDailyDb.findFirst({ where: { adAccountId, date } }))?.spend;

describe.skipIf(!hasDatabase)("synchro publicitaire (lot 8)", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.GOOGLE_ADS_ENABLED = "true";
    process.env.GOOGLE_ADS_CLIENT_ID = "id";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "secret";
    fake.report = null;
    fake.error = null;
  });

  it("rapport normal : jours enregistrés, jour disparu remis à zéro (correction de la régie)", async () => {
    const { account, recorded } = await setup();
    const yesterday = new Date(today().getTime() - DAY);
    fake.report = { days: [{ date: yesterday.toISOString().slice(0, 10), spend: 10, impressions: 100, clicks: 5, conversions: 0 }], campaigns: [] };
    expect((await syncAdAccount(account)).ok).toBe(true);
    expect(await spendOn(account.id, yesterday)).toBe(10);
    expect(await spendOn(account.id, recorded)).toBe(0);
  });

  it("rapport entièrement vide alors que des dépenses existent : chiffres et campagnes conservés", async () => {
    const { account, recorded } = await setup();
    fake.report = { days: [], campaigns: [] };
    expect((await syncAdAccount(account)).ok).toBe(true);
    expect(await spendOn(account.id, recorded)).toBe(42.5);
    const row = await adAccountDb.findUnique({ where: { id: account.id } });
    expect(JSON.parse(row!.campaigns as string)).toHaveLength(1);
  });

  it("réponse au format inattendu : compte en erreur, rien d'effacé, jamais « à reconnecter »", async () => {
    const { account, recorded } = await setup();
    fake.error = new AdsError("Google Ads a répondu dans un format inattendu : les chiffres déjà enregistrés sont conservés, l'équipe Nebula est prévenue.", 502, "UNEXPECTED_RESPONSE");
    const res = await syncAdAccount(account);
    expect(res.ok).toBe(false);
    const row = await adAccountDb.findUnique({ where: { id: account.id } });
    expect(row?.status).toBe("ERROR");
    expect(row?.lastError).toMatch(/format inattendu/);
    expect(await spendOn(account.id, recorded)).toBe(42.5);
    expect(await prisma.notification.count()).toBe(0);
  });
});
