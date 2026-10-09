import { afterEach, describe, expect, it, vi } from "vitest";

// Suppression groupée de la page Publications (09/10/2026), sur une vraie
// base : seulement ses publications, pas celles en cours d'envoi, fichiers
// partagés gardés tant qu'une publication les utilise.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/posts/bulk-delete/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

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
    expect(await res.json()).toEqual({ deleted: 2, publishing: 1, notFound: 2 });
    expect((await prisma.post.findMany({ select: { id: true } })).map((p: { id: string }) => p.id).sort()).toEqual([busy.id, theirs.id].sort());
    // Fichier utilisé seulement par les deux publications supprimées : effacé.
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(0);
  });

  it("refus : non connecté, liste vide ou trop longue", async () => {
    expect((await post({ ids: ["x"] })).status).toBe(401);
    session.userId = "u";
    expect((await post({ ids: [] })).status).toBe(400);
    expect((await post({ ids: Array.from({ length: 101 }, (_, i) => `p${i}`) })).status).toBe(400);
  });
});
