// Retour de la connexion Meta (30/09/2026) : Instagram et Facebook partagent
// UNE adresse de retour, /api/connections/meta/callback (META_REDIRECT_URI,
// celle déclarée dans le portail Meta). Avant, la route comparait « meta » au
// réseau de l'état signé (« instagram » ou « facebook ») et refusait tout :
// « État OAuth invalide ».
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  userId: "u1" as string | null,
  upserts: [] as { brandId: string; network: string; id: string }[]
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (h.userId ? { user: { id: h.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/brand-access", () => ({ assertBrandMembership: vi.fn(async () => true) }));
// Limite de comptes du palier (09/10/2026) : vérifiée compte par compte (connection-limit.ts).
vi.mock("@/lib/billing/connection-limit", () => ({ assertConnectionAllowed: vi.fn(async () => undefined) }));
vi.mock("@/lib/social", () => ({ getSocialClient: vi.fn() }));
vi.mock("@/lib/social/meta", () => ({
  exchangeMetaCode: vi.fn(async () => ({
    instagramAccounts: [{ externalAccountId: "ig-1", accessToken: "t", displayName: "insta" }],
    facebookPages: [{ externalAccountId: "fb-1", accessToken: "t", displayName: "Page" }]
  }))
}));
vi.mock("@/lib/connections", async (orig) => ({
  ...(await orig<typeof import("@/lib/connections")>()),
  upsertConnection: vi.fn(async (brandId: string, network: string, t: { externalAccountId: string }) => {
    h.upserts.push({ brandId, network, id: t.externalAccountId });
  })
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/connections/[provider]/callback/route";
import { encodeOAuthState } from "@/lib/connections";

const call = (path: string, state: Record<string, unknown>) =>
  GET(new NextRequest(`https://nebulahub.space/api/connections/${path}/callback?code=CODE&state=${encodeURIComponent(encodeOAuthState(state))}`), {
    params: { provider: path }
  });
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => {
  vi.stubEnv("NEXTAUTH_SECRET", "secret-de-test-assez-long-pour-hkdf-0123456789");
  h.userId = "u1";
  h.upserts.length = 0;
});

describe("retour de la connexion Meta", () => {
  it("adresse unique /meta/callback : Instagram demandé → comptes Instagram seulement", async () => {
    const res = await call("meta", { brandId: "b1", provider: "instagram", userId: "u1" });
    expect(location(res).searchParams.get("connected")).toBe("instagram");
    expect(location(res).searchParams.get("error")).toBeNull();
    expect(h.upserts).toEqual([{ brandId: "b1", network: "INSTAGRAM", id: "ig-1" }]);
  });

  it("adresse unique /meta/callback : Facebook demandé → Pages seulement", async () => {
    const res = await call("meta", { brandId: "b1", provider: "facebook", userId: "u1" });
    expect(location(res).searchParams.get("connected")).toBe("facebook");
    expect(h.upserts).toEqual([{ brandId: "b1", network: "FACEBOOK", id: "fb-1" }]);
  });

  it("anciennes adresses /instagram/callback et /facebook/callback toujours acceptées", async () => {
    expect(location(await call("instagram", { brandId: "b1", provider: "instagram", userId: "u1" })).searchParams.get("connected")).toBe("instagram");
    expect(location(await call("facebook", { brandId: "b1", provider: "facebook", userId: "u1" })).searchParams.get("connected")).toBe("facebook");
  });

  it("refus : autre personne, réseau hors Meta sur /meta/callback, réseau différent de l'adresse", async () => {
    for (const [path, state] of [
      ["meta", { brandId: "b1", provider: "instagram", userId: "u2" }],
      ["meta", { brandId: "b1", provider: "tiktok", userId: "u1" }],
      ["meta", { brandId: "b1", userId: "u1" }],
      ["facebook", { brandId: "b1", provider: "instagram", userId: "u1" }]
    ] as const) {
      const res = await call(path, state);
      expect(location(res).searchParams.get("error"), JSON.stringify(state)).toBe("État OAuth invalide.");
    }
    expect(h.upserts).toEqual([]);
  });
});
