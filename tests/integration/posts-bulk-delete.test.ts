import { afterEach, describe, expect, it, vi } from "vitest";

// Suppression groupée de la page Publications (09/10/2026), sur une vraie
// base : seulement ses publications, pas celles en cours d'envoi, fichiers
// partagés gardés tant qu'une publication les utilise. 10/10/2026 : la
// fenêtre propose aussi « Supprimer aussi sur … » réseau par réseau.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/posts/bulk-delete/route";
import { POST as PREVIEW } from "@/app/api/posts/bulk-delete/preview/route";
import { API_VERSIONS } from "@/lib/social/versions";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;
const preview = (body: unknown) =>
  PREVIEW(new NextRequest("http://localhost/api/posts/bulk-delete/preview", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

/** Deux publications en ligne (Facebook + TikTok, et Facebook seul) et un brouillon. */
async function online() {
  const { user, brand } = await makeBrand();
  session.userId = user.id;
  const conn = (network: string, scopes: string) =>
    prisma.socialConnection.create({ data: { brandId: brand.id, network, externalAccountId: `${network}-${Math.random()}`, displayName: `Compte ${network}`, accessToken: `tok-${network}`, scopes } });
  const fb = await conn("FACEBOOK", "pages_manage_posts,page_token");
  const tt = await conn("TIKTOK", "video.publish");
  const mkPost = (title: string, status = "PUBLISHED") => prisma.post.create({ data: { brandId: brand.id, createdById: user.id, title, caption: "", status } });
  const target = (postId: string, connectionId: string, network: string, externalPostId: string) =>
    prisma.postTarget.create({ data: { postId, connectionId, network, status: "PUBLISHED", externalPostId, externalUrl: `https://exemple.test/${externalPostId}`, metadata: {} } });
  const p1 = await mkPost("Menu d'automne");
  await target(p1.id, fb.id, "FACEBOOK", "101_1");
  await target(p1.id, tt.id, "TIKTOK", "730001");
  const p2 = await mkPost("Recette");
  await target(p2.id, fb.id, "FACEBOOK", "101_2");
  const draft = await mkPost("Brouillon", "DRAFT");
  return { p1, p2, draft };
}

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/posts/bulk-delete", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe.skipIf(!hasDatabase)("suppression groupée des publications", () => {
  afterEach(() => {
    session.userId = null;
  });

  it("supprime les siennes, laisse celles des autres et celles en cours d'envoi", async () => {
    await resetDatabase();
    const a = await makeBrand();
    const b = await makeBrand();
    const asset = await prisma.mediaAsset.create({ data: { brandId: a.brand.id, type: "IMAGE", url: "https://cdn.test/x.jpg", filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1 } });
    const mk = (brandId: string, userId: string, status: string, withMedia = false) =>
      prisma.post.create({ data: { brandId, createdById: userId, title: status, caption: "c", status, ...(withMedia ? { media: { create: { mediaAssetId: asset.id, order: 0 } } } : {}) } });
    const d1 = await mk(a.brand.id, a.user.id, "DRAFT", true);
    const d2 = await mk(a.brand.id, a.user.id, "SCHEDULED", true);
    const busy = await mk(a.brand.id, a.user.id, "PUBLISHING");
    const theirs = await mk(b.brand.id, b.user.id, "DRAFT");

    session.userId = a.user.id;
    const res = await post({ ids: [d1.id, d2.id, busy.id, theirs.id, "inconnu"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2, removedOn: {}, kept: [], publishing: 1, notFound: 2 });
    expect((await prisma.post.findMany({ select: { id: true } })).map((p: { id: string }) => p.id).sort()).toEqual([busy.id, theirs.id].sort());
    // Fichier utilisé seulement par les deux publications supprimées : effacé.
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(0);
  });

  it("aperçu : réseaux où les publications cochées sont en ligne, ce que Nebula peut y supprimer", async () => {
    await resetDatabase();
    const s = await online();
    const res = await preview({ ids: [s.p1.id, s.p2.id, s.draft.id] });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(3);
    expect(data.networks).toEqual([
      { network: "FACEBOOK", viaApi: 2, manual: 0, why: null, reconnect: false },
      expect.objectContaining({ network: "TIKTOK", viaApi: 0, manual: 1, why: expect.stringContaining("TikTok ne permet pas") })
    ]);
  });

  it("« Supprimer aussi sur Facebook » : retirées de Facebook et de Nebula ; TikTok n'est jamais appelé", async () => {
    await resetDatabase();
    const s = await online();
    const net = installNetwork([
      { method: "DELETE", url: `${G}/101_1`, body: { success: true } },
      { method: "DELETE", url: `${G}/101_2`, body: { success: true } }
    ]);
    const out = await (await post({ ids: [s.p1.id, s.p2.id, s.draft.id], alsoDeleteOn: ["FACEBOOK"] })).json();
    expect(out).toMatchObject({ deleted: 3, removedOn: { FACEBOOK: 2 }, kept: [] });
    expect(net.to(/graph\.facebook\.com/, "DELETE")).toHaveLength(2);
    expect(net.to(/tiktok/)).toHaveLength(0);
    expect(await prisma.post.count()).toBe(0);
    vi.unstubAllGlobals();
  });

  it("un réseau refuse : la publication reste dans Nebula avec l'erreur, les autres sont supprimées", async () => {
    await resetDatabase();
    const s = await online();
    installNetwork([
      { method: "DELETE", url: `${G}/101_1`, status: 400, body: { error: { message: "Permissions error", type: "OAuthException", code: 200 } } },
      { method: "DELETE", url: `${G}/101_2`, body: { success: true } }
    ]);
    const out = await (await post({ ids: [s.p1.id, s.p2.id], alsoDeleteOn: ["FACEBOOK"] })).json();
    expect(out.deleted).toBe(1);
    expect(out.removedOn).toEqual({ FACEBOOK: 1 });
    expect(out.kept).toEqual([{ id: s.p1.id, title: "Menu d'automne", failures: [expect.objectContaining({ network: "FACEBOOK", manualUrl: "https://exemple.test/101_1" })] }]);
    expect((await prisma.post.findMany({ select: { id: true } })).map((p: { id: string }) => p.id).sort()).toEqual([s.p1.id, s.draft.id].sort());
    // « Supprimer de Nebula seulement » : plus aucun appel au réseau.
    const net = installNetwork([]);
    expect(await (await post({ ids: [s.p1.id], alsoDeleteOn: [] })).json()).toMatchObject({ deleted: 1, kept: [] });
    expect(net.sent).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("refus : non connecté, liste vide ou trop longue, réseau inconnu", async () => {
    expect((await post({ ids: ["x"] })).status).toBe(401);
    session.userId = "u";
    expect((await post({ ids: [] })).status).toBe(400);
    expect((await post({ ids: Array.from({ length: 101 }, (_, i) => `p${i}`) })).status).toBe(400);
    expect((await post({ ids: ["x"], alsoDeleteOn: ["MYSPACE"] })).status).toBe(400);
    session.userId = null;
    expect((await preview({ ids: ["x"] })).status).toBe(401);
  });
});
