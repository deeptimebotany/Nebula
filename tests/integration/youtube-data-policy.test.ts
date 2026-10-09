import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Règles de YouTube sur les données (09/10/2026), sur une vraie base :
// déconnexion → tout est effacé ; commentaires et fiches de vidéos de plus
// de 30 jours effacés ; autorisation vérifiée pour les chaînes sans synchro
// depuis 25 jours (refus de Google → chaîne déconnectée et données effacées,
// panne → rien n'est touché).
import { prisma } from "@/lib/prisma";
import { disconnectConnection } from "@/lib/social/revoke";
import { ANONYMIZED_CHANNEL_NAME, checkYoutubeAuthorizations, purgeStaleYoutubeData } from "@/lib/social/youtube-data-policy";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function youtubeChannel(extra: Record<string, unknown> = {}) {
  const { brand } = await makeBrand();
  const connection = await prisma.socialConnection.create({
    data: {
      brandId: brand.id,
      network: "YOUTUBE",
      externalAccountId: `UC-${Math.random()}`,
      displayName: "Café Nebula",
      handle: "@cafenebula",
      avatarUrl: "https://yt3.ggpht.com/photo.jpg",
      accessToken: "tok-yt",
      refreshToken: "refresh-yt",
      tokenExpiresAt: daysAgo(3),
      lastSyncedAt: new Date(),
      ...extra
    }
  });
  await prisma.analyticsSnapshot.create({ data: { connectionId: connection.id, network: "YOUTUBE", followers: 1200 } });
  await prisma.postMetric.create({ data: { connectionId: connection.id, network: "YOUTUBE", postExternalId: "vid-1", title: "Latte art", views: 900 } });
  await prisma.engagementItem.create({
    data: { connectionId: connection.id, network: "YOUTUBE", externalId: `c-${Math.random()}`, text: "Super vidéo", publishedAt: daysAgo(2) }
  });
  return connection;
}

const counts = async (connectionId: string) => ({
  analytics: await prisma.analyticsSnapshot.count({ where: { connectionId } }),
  metrics: await prisma.postMetric.count({ where: { connectionId } }),
  comments: await prisma.engagementItem.count({ where: { connectionId } })
});

describe.skipIf(!hasDatabase)("règles de données YouTube", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client-test");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "secret-test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("déconnexion : statistiques, vidéos, commentaires, nom et photo effacés", async () => {
    const connection = await youtubeChannel();
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/revoke", body: {} }]);
    await disconnectConnection(connection.id);
    expect(await counts(connection.id)).toEqual({ analytics: 0, metrics: 0, comments: 0 });
    const after = await prisma.socialConnection.findUniqueOrThrow({ where: { id: connection.id } });
    expect(after).toMatchObject({ status: "DISCONNECTED", displayName: ANONYMIZED_CHANNEL_NAME, handle: null, avatarUrl: null, refreshToken: null });
  });

  it("commentaires de plus de 30 jours et fiches de vidéos non actualisées effacés, le reste gardé", async () => {
    const connection = await youtubeChannel();
    await prisma.engagementItem.create({ data: { connectionId: connection.id, network: "YOUTUBE", externalId: "vieux", text: "Ancien", publishedAt: daysAgo(31) } });
    await prisma.postMetric.create({ data: { connectionId: connection.id, network: "YOUTUBE", postExternalId: "vid-old", title: "Ancienne", capturedAt: daysAgo(40) } });
    const purged = await purgeStaleYoutubeData();
    expect(purged).toEqual({ comments: 1, videoStats: 1 });
    expect(await counts(connection.id)).toEqual({ analytics: 1, metrics: 1, comments: 1 });
  });

  it("chaîne sans synchro depuis 25 jours : Google accepte → données gardées", async () => {
    const connection = await youtubeChannel({ lastSyncedAt: daysAgo(26) });
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/token", body: { access_token: "nouveau", expires_in: 3600, token_type: "Bearer" } }]);
    expect(await checkYoutubeAuthorizations()).toEqual({ checked: 1, kept: 1, retired: 0 });
    expect(await counts(connection.id)).toEqual({ analytics: 1, metrics: 1, comments: 1 });
    // Jeton renouvelé : pas de nouvelle vérification avant demain.
    expect(await checkYoutubeAuthorizations()).toEqual({ checked: 0, kept: 0, retired: 0 });
  });

  it("autorisation retirée chez Google → chaîne déconnectée et données effacées", async () => {
    const connection = await youtubeChannel({ lastSyncedAt: daysAgo(26) });
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/token", status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }]);
    expect(await checkYoutubeAuthorizations()).toEqual({ checked: 1, kept: 0, retired: 1 });
    expect(await counts(connection.id)).toEqual({ analytics: 0, metrics: 0, comments: 0 });
    expect(await prisma.socialConnection.findUniqueOrThrow({ where: { id: connection.id } })).toMatchObject({ status: "DISCONNECTED", displayName: ANONYMIZED_CHANNEL_NAME });
  });

  it("panne de Google : rien n'est effacé, nouvel essai plus tard", async () => {
    const connection = await youtubeChannel({ lastSyncedAt: daysAgo(26) });
    installNetwork([{ method: "POST", url: "oauth2.googleapis.com/token", status: 503, body: { error: "backendError" } }]);
    expect(await checkYoutubeAuthorizations()).toEqual({ checked: 1, kept: 0, retired: 0 });
    expect(await counts(connection.id)).toEqual({ analytics: 1, metrics: 1, comments: 1 });
    expect((await prisma.socialConnection.findUniqueOrThrow({ where: { id: connection.id } })).status).toBe("CONNECTED");
  });

  it("chaîne à jour : aucune vérification", async () => {
    await youtubeChannel();
    expect(await checkYoutubeAuthorizations()).toEqual({ checked: 0, kept: 0, retired: 0 });
  });
});
