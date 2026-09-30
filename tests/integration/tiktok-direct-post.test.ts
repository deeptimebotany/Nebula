import { beforeEach, describe, expect, it, vi } from "vitest";

// TikTok, règles « Direct Post » (30/09/2026), sur une vraie base : rien ne
// part vers TikTok sans confidentialité choisie par la personne, ni depuis
// Publier ni par une programmation plus tard ; creator_info limité à 6
// appels par minute et par compte, réservé aux membres de la marque.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const creatorInfo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/social/tiktok", async (orig) => ({ ...(await orig<typeof import("@/lib/social/tiktok")>()), fetchTiktokCreatorInfo: creatorInfo }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPost } from "@/lib/posts/create-post";
import { SocialApiError } from "@/lib/social/base";
import { GET as getCreatorInfo } from "@/app/api/social/tiktok/creator-info/route";
import { PATCH as patchPost, POST as postAction } from "@/app/api/posts/[id]/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const CREATOR = {
  avatarUrl: null,
  username: "cafe.nebula",
  nickname: "Café Nebula",
  privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: false,
  maxVideoPostDurationSec: 300
};

function req(url: string, body?: unknown, method = "GET") {
  return new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function setup() {
  const { user, brand } = await makeBrand();
  const tiktok = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "TIKTOK", externalAccountId: `tt-${Date.now()}`, displayName: "Café Nebula", accessToken: "act" } });
  session.userId = user.id;
  return { user, brand, tiktok };
}

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe.skipIf(!hasDatabase)("TikTok : règles Direct Post", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
    creatorInfo.mockReset();
  });

  it("programmer ou publier sans confidentialité : refusé ; brouillon : permis", async () => {
    const { user, brand, tiktok } = await setup();
    const base = { brandId: brand.id, title: "", caption: "Latte art", mediaAssetIds: [], publishNow: false };
    const refused = await createPost(user.id, { ...base, scheduledAt: inAnHour(), targets: [{ connectionId: tiktok.id, network: "TIKTOK" }] });
    expect(refused).toMatchObject({ ok: false, status: 400, reason: "tiktok_options" });
    const branded = await createPost(user.id, {
      ...base,
      scheduledAt: inAnHour(),
      targets: [{ connectionId: tiktok.id, network: "TIKTOK", metadata: { tiktok: { privacyLevel: "SELF_ONLY", commercial: true, brandedContent: true } } }]
    });
    expect(branded).toMatchObject({ ok: false, status: 400 });
    expect((branded as { error: string }).error).toContain("« Moi uniquement »");
    expect(await prisma.post.count()).toBe(0);

    const ok = await createPost(user.id, {
      ...base,
      scheduledAt: inAnHour(),
      targets: [{ connectionId: tiktok.id, network: "TIKTOK", metadata: { tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, commercial: true, yourBrand: true } } }]
    });
    expect(ok.ok).toBe(true);
    const target = await prisma.postTarget.findFirstOrThrow({ where: { network: "TIKTOK" } });
    expect(target.metadata).toMatchObject({ tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, commercial: true, yourBrand: true } });

    const draft = await createPost(user.id, { ...base, targets: [{ connectionId: tiktok.id, network: "TIKTOK" }] });
    expect(draft.ok).toBe(true);
  });

  it("brouillon TikTok sans confidentialité (import CSV…) : ni programmation ni « Publier maintenant »", async () => {
    const { user, brand, tiktok } = await setup();
    const draft = await createPost(user.id, { brandId: brand.id, title: "", caption: "x", mediaAssetIds: [], publishNow: false, targets: [{ connectionId: tiktok.id, network: "TIKTOK" }] });
    if (!draft.ok) throw new Error("brouillon refusé");
    const patched = await patchPost(req(`/api/posts/${draft.postId}`, { scheduledAt: inAnHour() }, "PATCH"), { params: { id: draft.postId } });
    expect(patched.status).toBe(400);
    expect(await patched.json()).toMatchObject({ reason: "tiktok_options" });
    const now = await postAction(req(`/api/posts/${draft.postId}`, { action: "publish-now" }, "POST"), { params: { id: draft.postId } });
    expect(now.status).toBe(400);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: draft.postId } })).status).toBe("DRAFT");
  });

  it("creator_info : membres de la marque seulement, 6 appels par minute et par compte", async () => {
    const { tiktok } = await setup();
    creatorInfo.mockResolvedValue(CREATOR);
    for (let i = 0; i < 6; i++) {
      const res = await getCreatorInfo(req(`/api/social/tiktok/creator-info?connectionId=${tiktok.id}`));
      expect(res.status).toBe(200);
    }
    expect(await (await getCreatorInfo(req(`/api/social/tiktok/creator-info?connectionId=${tiktok.id}`))).json()).toMatchObject({ error: expect.stringContaining("réessayez dans une minute") });
    expect(creatorInfo).toHaveBeenCalledTimes(6);

    const stranger = await prisma.user.create({ data: { email: `x-${Date.now()}@test.fr`, name: "X" } });
    session.userId = stranger.id;
    expect((await getCreatorInfo(req(`/api/social/tiktok/creator-info?connectionId=${tiktok.id}`))).status).toBe(404);
  });

  it("créateur qui ne peut plus publier : message clair, publication bloquée dans Publier", async () => {
    const { tiktok } = await setup();
    creatorInfo.mockRejectedValue(new SocialApiError("TIKTOK", "The daily post cap from the API is reached.", 400, undefined, "spam_risk_too_many_posts"));
    const res = await getCreatorInfo(req(`/api/social/tiktok/creator-info?connectionId=${tiktok.id}`));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ cannotPost: true, error: expect.stringContaining("limite de publications") });
  });
});
