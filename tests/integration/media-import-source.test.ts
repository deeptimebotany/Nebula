import { beforeEach, describe, expect, it, vi } from "vitest";

// « Importé depuis Canva » (03/10/2026), sur une vraie base : la page d'une
// publication reçoit l'origine du média ; une vidéo modifiée dans l'éditeur
// de Publier recopie l'origine de la vidéo d'avant, seulement depuis un
// média déjà importé de la même marque, sans jamais remplacer une origine.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PATCH } from "@/app/api/media/[id]/route";
import { GET as getPost } from "@/app/api/posts/[id]/route";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const patch = (id: string, body: unknown) =>
  PATCH(new NextRequest(`http://localhost/api/media/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: { id } });

const asset = (brandId: string, importSource: string | null, type = "VIDEO") =>
  prisma.mediaAsset.create({
    data: { brandId, type, url: `https://cdn.test/${Math.random()}.mp4`, filename: "design.mp4", mimeType: "video/mp4", sizeBytes: 10, importSource }
  });

const sourceOf = async (id: string) => (await prisma.mediaAsset.findUniqueOrThrow({ where: { id } })).importSource;

describe.skipIf(!hasDatabase)("origine d'un média importé", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("la page d'une publication reçoit l'origine du média", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    const media = await asset(brand.id, "canva", "IMAGE");
    const post = await prisma.post.create({ data: { brandId: brand.id, createdById: user.id, caption: "canva démo", media: { create: { mediaAssetId: media.id } } } });
    const body = (await (await getPost(new NextRequest(`http://localhost/api/posts/${post.id}`), { params: { id: post.id } })).json()) as {
      post: { media: { mediaAsset: { importSource: string | null } }[] };
    };
    expect(body.post.media[0].mediaAsset.importSource).toBe("canva");
  });

  it("vidéo modifiée : garde l'origine de la vidéo importée", async () => {
    const { user, brand } = await makeBrand();
    session.userId = user.id;
    const imported = await asset(brand.id, "canva");
    const edited = await asset(brand.id, null);
    const res = await patch(edited.id, { importSourceFrom: imported.id });
    expect(res.status).toBe(200);
    expect(await sourceOf(edited.id)).toBe("canva");
  });

  it("jamais depuis un média non importé, d'une autre marque, ni par-dessus une origine connue", async () => {
    const { user, brand } = await makeBrand();
    const other = await makeBrand();
    session.userId = user.id;
    const plain = await asset(brand.id, null);
    const target = await asset(brand.id, null);
    const foreign = await asset(other.brand.id, "dropbox");
    expect((await patch(target.id, { importSourceFrom: plain.id })).status).toBe(404);
    expect((await patch(target.id, { importSourceFrom: foreign.id })).status).toBe(404);
    expect(await sourceOf(target.id)).toBeNull();

    const known = await asset(brand.id, "onedrive");
    const canva = await asset(brand.id, "canva");
    expect((await patch(known.id, { importSourceFrom: canva.id })).status).toBe(200);
    expect(await sourceOf(known.id)).toBe("onedrive");

    // Le média d'un autre client : introuvable, comme avant.
    expect((await patch(foreign.id, { importSourceFrom: canva.id })).status).toBe(404);
    expect(await sourceOf(foreign.id)).toBe("dropbox");
  });
});
