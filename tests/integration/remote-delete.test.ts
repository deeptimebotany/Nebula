import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// « Supprimer aussi sur … » (01/10/2026), sur une vraie base : la fiche
// reçoit ce que chaque réseau permet ; la suppression retire la
// publication des réseaux cochés, et ne la retire de Nebula que si tout a
// réussi (sinon chaque réseau est détaillé et ce qui est fait reste noté).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { API_VERSIONS } from "@/lib/social/versions";
import { DELETE as deletePost, GET as getPost } from "@/app/api/posts/[id]/route";
import { installNetwork } from "../contracts/harness";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const G = `graph.facebook.com/${API_VERSIONS.META_GRAPH.version}`;

function call(handler: typeof deletePost, id: string, body?: unknown) {
  const init = body === undefined ? { method: "DELETE" } : { method: "DELETE", body: JSON.stringify(body), headers: { "content-type": "application/json" } };
  return handler(new NextRequest(`http://localhost/api/posts/${id}`, init), { params: { id } });
}

async function setup() {
  const { user, brand } = await makeBrand();
  session.userId = user.id;
  const conn = (network: string, scopes = "", extra: Record<string, unknown> = {}) =>
    prisma.socialConnection.create({
      data: { brandId: brand.id, network, externalAccountId: `${network}-${Math.random()}`, displayName: `Compte ${network}`, accessToken: `tok-${network}`, scopes, ...extra }
    });
  const fb = await conn("FACEBOOK", "pages_manage_posts,page_token");
  const li = await conn("LINKEDIN", "openid profile w_member_social", { tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
  const ig = await conn("INSTAGRAM", "instagram_basic,instagram_content_publish");
  const tt = await conn("TIKTOK", "video.publish");
  const post = await prisma.post.create({ data: { brandId: brand.id, createdById: user.id, title: "", caption: "Menu d'automne", status: "PUBLISHED" } });
  const target = (connectionId: string, network: string, externalPostId: string | null, status = "PUBLISHED") =>
    prisma.postTarget.create({
      data: { postId: post.id, connectionId, network, status, externalPostId, externalUrl: externalPostId ? `https://exemple.test/${externalPostId}` : null, metadata: { aiGenerated: false } }
    });
  return {
    user,
    brand,
    post,
    fbT: await target(fb.id, "FACEBOOK", "101_202"),
    liT: await target(li.id, "LINKEDIN", "urn:li:share:1"),
    igT: await target(ig.id, "INSTAGRAM", "17890001"),
    ttT: await target(tt.id, "TIKTOK", "7300000000000000001"),
    failedT: await target(fb.id, "FACEBOOK", null, "FAILED")
  };
}

describe.skipIf(!hasDatabase)("Supprimer aussi sur les réseaux", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    delete process.env.META_INSTAGRAM_DELETE;
    process.env.META_APP_SECRET = "app-secret";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la fiche reçoit ce que chaque réseau permet, sans les permissions du compte", async () => {
    const s = await setup();
    const res = await getPost(new NextRequest(`http://localhost/api/posts/${s.post.id}`), { params: { id: s.post.id } });
    const { post } = (await res.json()) as { post: { targets: { id: string; connection: Record<string, unknown>; remoteDelete: { mode: string; manageUrl?: string } | null }[] } };
    const by = (id: string) => post.targets.find((t) => t.id === id)!;
    expect(by(s.fbT.id).remoteDelete).toEqual({ mode: "api" });
    expect(by(s.liT.id).remoteDelete).toEqual({ mode: "api" });
    expect(by(s.igT.id).remoteDelete).toMatchObject({ mode: "manual", manageUrl: "https://exemple.test/17890001" });
    expect(by(s.ttT.id).remoteDelete).toMatchObject({ mode: "manual" });
    expect(by(s.failedT.id).remoteDelete).toBeNull();
    for (const t of post.targets) expect(t.connection).not.toHaveProperty("scopes");
  });

  it("un réseau échoue : publication gardée dans Nebula, réussite notée ; nouvel essai → supprimée partout", async () => {
    const s = await setup();
    const net = installNetwork([
      { method: "DELETE", url: `${G}/101_202`, body: { success: true } },
      { method: "DELETE", url: /^api\.linkedin\.com\/rest\/posts\//, status: 403, body: { message: "Not enough permissions to access: partnerApiPostsExternal.DELETE", status: 403 }, times: 1 }
    ]);
    const first = await (await call(deletePost, s.post.id, { alsoDeleteOn: [s.fbT.id, s.liT.id] })).json();
    expect(first.deleted).toBe(false);
    expect(first.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: s.fbT.id, ok: true }),
        expect.objectContaining({ targetId: s.liT.id, ok: false, manualUrl: "https://exemple.test/urn:li:share:1" })
      ])
    );
    expect(await prisma.post.findUnique({ where: { id: s.post.id } })).not.toBeNull();
    const fbAfter = await prisma.postTarget.findUnique({ where: { id: s.fbT.id } });
    expect((fbAfter?.metadata as Record<string, unknown>).removedFromNetworkAt).toEqual(expect.any(String));
    expect((fbAfter?.metadata as Record<string, unknown>).aiGenerated).toBe(false);

    // La fiche ne propose plus Facebook (déjà retirée) ; LinkedIn réessayé avec succès.
    installNetwork([{ method: "DELETE", url: /^api\.linkedin\.com\/rest\/posts\//, status: 204, raw: "" }]);
    const second = await (await call(deletePost, s.post.id, { alsoDeleteOn: [s.liT.id] })).json();
    expect(second).toMatchObject({ ok: true, deleted: true });
    expect(await prisma.post.findUnique({ where: { id: s.post.id } })).toBeNull();
    expect(net.to(/linkedin/, "DELETE")).toHaveLength(1);
  });

  it("déjà absente du réseau (Meta 100/33) : comptée comme supprimée", async () => {
    const s = await setup();
    installNetwork([
      { method: "DELETE", url: `${G}/101_202`, status: 400, body: { error: { message: "Unsupported delete request. Object with ID '101_202' does not exist", type: "GraphMethodException", code: 100, error_subcode: 33 } } }
    ]);
    const out = await (await call(deletePost, s.post.id, { alsoDeleteOn: [s.fbT.id] })).json();
    expect(out).toMatchObject({ deleted: true, results: [expect.objectContaining({ ok: true, alreadyGone: true })] });
  });

  it("réseau sans suppression (Instagram sans permission, TikTok) ou cible d'une autre publication : rien n'est appelé, rien n'est supprimé", async () => {
    const s = await setup();
    const other = await setup();
    const net = installNetwork([]);
    session.userId = s.user.id;
    const out = await (await call(deletePost, s.post.id, { alsoDeleteOn: [s.igT.id, s.ttT.id, other.fbT.id] })).json();
    expect(out.deleted).toBe(false);
    expect(out.results.every((r: { ok: boolean }) => !r.ok)).toBe(true);
    expect(net.sent).toHaveLength(0);
    expect(await prisma.post.findUnique({ where: { id: s.post.id } })).not.toBeNull();
    expect(await prisma.postTarget.findUnique({ where: { id: other.fbT.id } })).toMatchObject({ metadata: { aiGenerated: false } });
  });

  it("sans case cochée (ou ancienne fiche sans corps) : Nebula seulement, aucun appel réseau", async () => {
    const s = await setup();
    const net = installNetwork([]);
    expect(await (await call(deletePost, s.post.id)).json()).toMatchObject({ ok: true, deleted: true, results: [] });
    expect(net.sent).toHaveLength(0);
    const s2 = await setup();
    expect(await (await call(deletePost, s2.post.id, { alsoDeleteOn: [] })).json()).toMatchObject({ deleted: true });
  });

  it("publication d'une autre marque : 404, rien n'est touché", async () => {
    const s = await setup();
    const intruder = await makeBrand();
    session.userId = intruder.user.id;
    const net = installNetwork([]);
    const res = await call(deletePost, s.post.id, { alsoDeleteOn: [s.fbT.id] });
    expect(res.status).toBe(404);
    expect(net.sent).toHaveLength(0);
    expect(await prisma.post.findUnique({ where: { id: s.post.id } })).not.toBeNull();
  });
});
