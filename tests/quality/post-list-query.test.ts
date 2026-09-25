import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { MAX_POSTS_PER_REQUEST, parsePostListQuery, periodWhere, PostListQueryError } from "@/lib/posts/list-posts";

const q = (s: string) => parsePostListQuery(new URLSearchParams(s));

// GET /api/posts par période (lot 4, performance).
describe("paramètres de la liste des publications", () => {
  it("sans paramètre : réponse complète d'avant, plafonnée", () => {
    expect(q("brandId=b1")).toEqual({ from: null, to: null, view: "full", limit: MAX_POSTS_PER_REQUEST });
  });

  it("lit la période, la vue allégée et la limite", () => {
    const r = q("from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z&view=light&limit=50");
    expect(r.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(r.to?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.view).toBe("light");
    expect(r.limit).toBe(50);
    expect(q("limit=999999").limit).toBe(MAX_POSTS_PER_REQUEST);
  });

  it("refuse une date invalide, une période à l'envers ou trop longue, une limite absurde", () => {
    expect(() => q("from=hier")).toThrow(PostListQueryError);
    expect(() => q("from=2026-10-01T00:00:00Z&to=2026-09-01T00:00:00Z")).toThrow(PostListQueryError);
    expect(() => q("from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z")).toThrow(/trop longue/);
    expect(() => q("limit=0")).toThrow(PostListQueryError);
    expect(() => q("limit=2.5")).toThrow(PostListQueryError);
  });

  it("filtre sur la date de programmation, sinon la date de création", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-10-01T00:00:00Z");
    expect(periodWhere(null, null)).toEqual({});
    expect(periodWhere(from, to)).toEqual({
      OR: [{ scheduledAt: { gte: from, lt: to } }, { scheduledAt: null, createdAt: { gte: from, lt: to } }]
    });
    expect(periodWhere(from, null)).toEqual({ OR: [{ scheduledAt: { gte: from } }, { scheduledAt: null, createdAt: { gte: from } }] });
  });
});
