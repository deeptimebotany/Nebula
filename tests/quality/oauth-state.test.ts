import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
process.env.NEXTAUTH_SECRET = "test-secret-0123456789abcdefghijklmnop";

import { decodeOAuthState, encodeOAuthState } from "@/lib/connections";

afterEach(() => vi.useRealTimers());

describe("état OAuth signé", () => {
  it("aller-retour", () => {
    const state = encodeOAuthState({ brandId: "b1", userId: "u1", provider: "tiktok" });
    expect(decodeOAuthState<{ brandId: string }>(state).brandId).toBe("b1");
  });
  it("refuse un état modifié (autre marque)", () => {
    const state = encodeOAuthState({ brandId: "b1", userId: "u1" });
    const [, sig] = state.split(".");
    const forged = `${Buffer.from(JSON.stringify({ brandId: "b2", userId: "u1", iat: Date.now() })).toString("base64url")}.${sig}`;
    expect(() => decodeOAuthState(forged)).toThrow();
  });
  it("refuse un état de plus de 10 minutes", () => {
    const state = encodeOAuthState({ brandId: "b1" });
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000 });
    expect(() => decodeOAuthState(state)).toThrow(/expiré/);
  });
});
