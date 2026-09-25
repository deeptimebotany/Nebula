import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { backfillSecrets, prisma } from "@/lib/prisma";
import { authOptions, resolveOAuthSignIn } from "@/lib/auth";
import { resetSecretKeysForTests } from "@/lib/crypto/secret-box";
import { handleDataDeletion } from "@/lib/meta-callbacks";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

type Jwt = (a: { token: Record<string, unknown>; user?: unknown; account?: unknown }) => Promise<Record<string, unknown>>;
const jwt = authOptions.callbacks!.jwt as unknown as Jwt;
const sessionOk = (token: Record<string, unknown>) => jwt({ token }).then(
  () => true,
  () => false
);
const rawToken = async (id: string) =>
  (await prisma.$queryRaw<{ accessToken: string }[]>`select "accessToken" from "SocialConnection" where id = ${id}`)[0].accessToken;

describe.skipIf(!hasDatabase)("comptes : prise de contrôle impossible (lot 1)", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.ADMIN_EMAILS = "boss@nebula.test";
  });

  it("le vrai propriétaire arrive par Google : mot de passe de l'intrus supprimé, sessions coupées", async () => {
    const squatter = await prisma.user.create({ data: { email: "victime@test.fr", name: "Intrus", passwordHash: "x", emailVerifiedAt: null } });
    expect(await sessionOk({ uid: squatter.id, sv: 0 })).toBe(true);
    expect((await resolveOAuthSignIn({ provider: "google", providerAccountId: "g", email: "victime@test.fr", emailVerified: true, name: "V" })).ok).toBe(true);
    const after = await prisma.user.findUnique({ where: { id: squatter.id } });
    expect(after?.passwordHash).toBeNull();
    expect(after?.sessionVersion).toBe(1);
    expect(await sessionOk({ uid: squatter.id, sv: 0 })).toBe(false);
    expect(await sessionOk({ uid: squatter.id, sv: 1 })).toBe(true);
  });

  it("Meta ne peut pas se greffer sur un compte existant ; adresse réservée protégée", async () => {
    await prisma.user.create({ data: { email: "alice@test.fr", name: "A" } });
    expect(await resolveOAuthSignIn({ provider: "facebook", providerAccountId: "fb", email: "alice@test.fr", emailVerified: false, name: "X" })).toEqual({
      ok: false,
      error: "AccountExists"
    });
    expect(await resolveOAuthSignIn({ provider: "facebook", providerAccountId: "fb2", email: "boss@nebula.test", emailVerified: false, name: "X" })).toEqual({
      ok: false,
      error: "EmailReserved"
    });
  });
});

describe.skipIf(!hasDatabase)("jetons chiffrés en base (lot 1)", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    resetSecretKeysForTests();
  });

  it("chiffrés à l'écriture, déchiffrés à la lecture (relations comprises)", async () => {
    const { user, brand } = await makeBrand();
    const c = await prisma.socialConnection.create({
      data: { brandId: brand.id, network: "TIKTOK", externalAccountId: "t", displayName: "T", accessToken: "AT-1", refreshToken: "RT-1" }
    });
    expect(await rawToken(c.id)).toMatch(/^enc:v1:/);
    const post = await prisma.post.create({ data: { brandId: brand.id, createdById: user.id, targets: { create: [{ connectionId: c.id, network: "TIKTOK" }] } } });
    const nested = await prisma.post.findUnique({ where: { id: post.id }, include: { targets: { include: { connection: true } } } });
    expect(nested?.targets[0].connection.accessToken).toBe("AT-1");
  });

  it("les jetons déjà en clair sont chiffrés par le rattrapage", async () => {
    const { brand } = await makeBrand();
    delete process.env.TOKEN_ENCRYPTION_KEY;
    resetSecretKeysForTests();
    const c = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "YOUTUBE", externalAccountId: "y", displayName: "Y", accessToken: "PLAIN" } });
    expect(await rawToken(c.id)).toBe("PLAIN");
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    resetSecretKeysForTests();
    await backfillSecrets();
    expect(await rawToken(c.id)).toMatch(/^enc:v1:/);
    expect((await prisma.socialConnection.findUnique({ where: { id: c.id } }))?.accessToken).toBe("PLAIN");
  });
});

describe.skipIf(!hasDatabase)("suppression des données demandée par Meta (lot 2)", () => {
  beforeEach(resetDatabase);

  it("données synchronisées effacées, compte anonymisé, autres personnes intactes", async () => {
    const { brand } = await makeBrand();
    const ig = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig", displayName: "IG", accessToken: "a", authUserId: "U1" } });
    const other = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "ig2", displayName: "IG2", accessToken: "b", authUserId: "U2" } });
    await prisma.postMetric.create({ data: { connectionId: ig.id, network: "INSTAGRAM", postExternalId: "m" } });
    const { code, connections } = await handleDataDeletion("meta", "U1");
    expect(connections).toBe(1);
    expect((await prisma.dataDeletionRequest.findUnique({ where: { id: code } }))?.status).toBe("COMPLETED");
    expect(await prisma.postMetric.count()).toBe(0);
    expect((await prisma.socialConnection.findUnique({ where: { id: ig.id } }))?.displayName).toBe("Compte supprimé");
    expect((await prisma.socialConnection.findUnique({ where: { id: other.id } }))?.status).toBe("CONNECTED");
  });
});
