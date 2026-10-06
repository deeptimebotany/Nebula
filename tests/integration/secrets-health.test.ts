import { randomBytes } from "crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Chiffrement des jetons (06/10/2026) : état affiché au propriétaire et
// alertes du cron — clé absente en production (une seule fois), jetons
// impossibles à chiffrer ou relire (une fois par jour).
import { backfillSecrets, prisma, secretsStatus } from "@/lib/prisma";
import { resetSecretKeysForTests } from "@/lib/crypto/secret-box";
import { OWNER_EMAIL } from "@/lib/owner";
import { checkSecretsHealth } from "@/lib/secrets-health";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const NOW = new Date("2026-10-06T10:00:00Z");
const noKey = () => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  resetSecretKeysForTests();
};
const withKey = () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  resetSecretKeysForTests();
};

describe.skipIf(!hasDatabase)("chiffrement des jetons : état et alertes", () => {
  beforeEach(async () => {
    await resetDatabase();
    noKey();
  });
  afterAll(noKey);

  async function tiktok() {
    const { brand } = await makeBrand();
    return prisma.socialConnection.create({
      data: { brandId: brand.id, network: "TIKTOK", externalAccountId: "open-1", displayName: "T", accessToken: "act.PLAIN", refreshToken: "rft.PLAIN" }
    });
  }

  it("sans clé : état « inactif », jetons comptés en clair ; alerte en production une seule fois", async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    await tiktok();
    expect(await secretsStatus()).toEqual({ enabled: false, total: 2, sealed: 0, plain: 2, otherKey: 0 });
    // Hors production : rien.
    expect(await checkSecretsHealth({ sealed: 0, failed: 0 }, { now: NOW, production: false })).toBe("skipped");
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(0);
    expect(await checkSecretsHealth({ sealed: 0, failed: 0 }, { now: NOW, production: true })).toBe("missing-key");
    const notes = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Jetons des comptes connectés enregistrés en clair", href: "/admin/reseaux", dedupeKey: "secrets:cle-absente" });
    expect(notes[0].body).toContain("2 jetons (TikTok, YouTube, Meta, intégrations…) sont enregistrés en clair");
    // Le cron repasse chaque minute : jamais une deuxième alerte.
    expect(await checkSecretsHealth({ sealed: 0, failed: 0 }, { now: NOW, production: true })).toBe("skipped");
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(1);
  });

  it("clé ajoutée : le rattrapage chiffre tout, l'état le montre ; aucune alerte", async () => {
    await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    const c = await tiktok();
    withKey();
    expect(await secretsStatus()).toMatchObject({ enabled: true, total: 2, sealed: 0, plain: 2 });
    const result = await backfillSecrets();
    expect(result).toEqual({ sealed: 2, failed: 0 });
    expect(await secretsStatus()).toEqual({ enabled: true, total: 2, sealed: 2, plain: 0, otherKey: 0 });
    expect(await checkSecretsHealth(result, { now: NOW, production: true })).toBe("ok");
    expect(await prisma.notification.count()).toBe(0);
    // Toujours lisibles par l'application.
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: c.id } })).refreshToken).toBe("rft.PLAIN");
  });

  it("clé changée sans l'ancienne : jeton illisible compté à part, alerte une fois par jour", async () => {
    await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Lucas" } });
    withKey();
    await tiktok();
    // Nouvelle clé, l'ancienne oubliée (pas de TOKEN_ENCRYPTION_KEY_PREVIOUS).
    withKey();
    const status = await secretsStatus();
    expect(status).toMatchObject({ enabled: true, total: 2, sealed: 0, plain: 0, otherKey: 2 });
    const result = await backfillSecrets();
    expect(result.failed).toBe(2);
    expect(await checkSecretsHealth(result, { now: NOW, production: true })).toBe("failed");
    expect(await checkSecretsHealth(result, { now: new Date(NOW.getTime() + 3_600_000), production: true })).toBe("failed");
    const notes = await prisma.notification.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "Des jetons n'ont pas pu être chiffrés", dedupeKey: "secrets:echec:2026-10-06" });
    expect(notes[0].body).toContain("TOKEN_ENCRYPTION_KEY_PREVIOUS");
  });
});
