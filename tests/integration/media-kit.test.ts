import { beforeEach, describe, expect, it, vi } from "vitest";

// Media kit public (produit n°10), sur une vraie base : éditeur réservé aux
// membres, réglages enregistrés dans tous les paliers mais publication
// Pro/Agence (402 « media_kit »), comptes et publications d'une autre marque
// refusés, page publique seulement si publiée ET palier payant, ouvertures
// comptées une fois par jour et par visiteur (jamais les membres ni les
// robots), dépublication à la fin de l'essai.
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as getEditor, PUT as putEditor } from "@/app/api/media-kit/route";
import { POST as postView } from "@/app/api/public/kit/[slug]/view/route";
import { getPublicKit, mediaKitDb } from "@/lib/media-kit/load";
import { applyTrialExpirations } from "@/lib/billing/trial-expiry";
import type { KitEditorDTO } from "@/lib/media-kit/types";
import { hasDatabase, makeBrand, resetDatabase } from "./helpers";

const DAY = 86_400_000;

async function seedBrand(opts: { comp?: "PRO" | "AGENCY" } = {}) {
  const { user, brand } = await makeBrand();
  if (opts.comp) await prisma.user.update({ where: { id: user.id }, data: { compPlan: opts.comp } });
  const yt = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "YOUTUBE", externalAccountId: "UCabcdefghijklmnopqrstuv", displayName: "Café Nebula", accessToken: "AT-SECRET" } });
  const ig = await prisma.socialConnection.create({ data: { brandId: brand.id, network: "INSTAGRAM", externalAccountId: "1784", displayName: "cafe.nebula", handle: "@cafe.nebula", accessToken: "AT-SECRET-2" } });
  const now = Date.now();
  await prisma.analyticsSnapshot.create({ data: { connectionId: yt.id, network: "YOUTUBE", followers: 9_500, capturedAt: new Date(now - 32 * DAY) } });
  await prisma.analyticsSnapshot.create({ data: { connectionId: yt.id, network: "YOUTUBE", followers: 10_000, capturedAt: new Date(now - DAY) } });
  await prisma.analyticsSnapshot.create({ data: { connectionId: ig.id, network: "INSTAGRAM", followers: 4_000, capturedAt: new Date(now - DAY) } });
  const posts = [];
  for (const [i, views] of [3_000, 1_000, 2_000].entries()) {
    posts.push(
      await prisma.postMetric.create({
        data: { connectionId: yt.id, network: "YOUTUBE", postExternalId: `v${i}`, title: `Vidéo ${i}`, permalink: `https://youtu.be/v${i}`, views, likes: 100, comments: 10, shares: 10, publishedAt: new Date(now - (5 + i * 7) * DAY) }
      })
    );
  }
  return { user, brand, yt, ig, posts };
}

function req(url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  return new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? (init?.body !== undefined ? "PUT" : "GET"),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
}

const view = (slug: string, ip: string, ua = "Mozilla/5.0 (Macintosh)") =>
  postView(req(`/api/public/kit/${slug}/view`, { method: "POST", headers: { "x-forwarded-for": ip, "user-agent": ua } }), { params: { slug } });

describe.skipIf(!hasDatabase)("media kit : éditeur, publication, page publique, ouvertures", () => {
  beforeEach(async () => {
    await resetDatabase();
    session.userId = null;
  });

  it("éditeur : membres seulement ; aperçu avec les vrais chiffres, même en Gratuit ; aucun jeton renvoyé", async () => {
    const { user, brand } = await seedBrand();
    const outsider = await seedBrand();
    expect((await getEditor(req(`/api/media-kit?brandId=${brand.id}`))).status).toBe(401);
    session.userId = outsider.user.id;
    expect((await getEditor(req(`/api/media-kit?brandId=${brand.id}`))).status).toBe(404);

    session.userId = user.id;
    const res = await getEditor(req(`/api/media-kit?brandId=${brand.id}`));
    const raw = await res.text();
    expect(raw).not.toContain("AT-SECRET");
    const dto = JSON.parse(raw) as KitEditorDTO;
    expect(dto).toMatchObject({ allowed: false, slug: brand.slug, views: 0, settings: { published: false } });
    expect(dto.preview.stats.totals).toMatchObject({ audience: 14_000, accounts: 2 });
    expect(dto.preview.stats.accounts[0]).toMatchObject({ network: "YOUTUBE", followers: 10_000, medianViews: 2_000, growth: { delta: 500 } });
    expect(dto.postChoices).toHaveLength(3);
  });

  it("Gratuit : réglages enregistrés, publication refusée (402) ; Pro : publié", async () => {
    const { user, brand, ig, posts } = await seedBrand();
    const other = await seedBrand();
    session.userId = user.id;

    const saved = await putEditor(
      req("/api/media-kit", {
        body: {
          brandId: brand.id,
          headline: "  Recettes   de café maison ",
          about: "Bonjour\n\n\n\nà tous",
          contactEmail: "partenariats@cafe.fr",
          offers: [{ label: "Vidéo dédiée", price: "900 €" }, { label: "   ", price: "1 €" }],
          hiddenConnectionIds: [ig.id, other.ig.id],
          featuredPostIds: [posts[2].id, other.posts[0].id, posts[2].id]
        }
      })
    );
    expect(saved.status).toBe(200);
    const dto = (await saved.json()) as KitEditorDTO;
    expect(dto.settings).toMatchObject({
      headline: "Recettes de café maison",
      about: "Bonjour\n\nà tous",
      contactEmail: "partenariats@cafe.fr",
      offers: [{ label: "Vidéo dédiée", price: "900 €" }],
      hiddenConnectionIds: [ig.id],
      featuredPostIds: [posts[2].id]
    });
    expect(dto.preview.stats.accounts.map((a) => a.network)).toEqual(["YOUTUBE"]);
    expect(dto.preview.stats.posts.map((p) => p.id)).toEqual([posts[2].id]);

    const bad = await putEditor(req("/api/media-kit", { body: { brandId: brand.id, contactEmail: "pas-une-adresse" } }));
    expect(bad.status).toBe(400);

    // Un enregistrement partiel ne touche pas aux autres réglages (bug trouvé à l'essai : l'e-mail était effacé).
    const partial = (await (await putEditor(req("/api/media-kit", { body: { brandId: brand.id, hiddenConnectionIds: [] } }))).json()) as KitEditorDTO;
    expect(partial.settings).toMatchObject({ contactEmail: "partenariats@cafe.fr", headline: "Recettes de café maison", hiddenConnectionIds: [] });
    const cleared = (await (await putEditor(req("/api/media-kit", { body: { brandId: brand.id, contactEmail: "" } }))).json()) as KitEditorDTO;
    expect(cleared.settings.contactEmail).toBeNull();
    await putEditor(req("/api/media-kit", { body: { brandId: brand.id, contactEmail: "partenariats@cafe.fr", hiddenConnectionIds: [ig.id] } }));

    const free = await putEditor(req("/api/media-kit", { body: { brandId: brand.id, published: true } }));
    expect(free.status).toBe(402);
    expect(await free.json()).toMatchObject({ reason: "media_kit" });
    expect(await getPublicKit(brand.slug)).toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { compPlan: "PRO" } });
    const pro = await putEditor(req("/api/media-kit", { body: { brandId: brand.id, published: true } }));
    expect(pro.status).toBe(200);
    expect(((await pro.json()) as KitEditorDTO)).toMatchObject({ allowed: true, settings: { published: true } });
    expect((await mediaKitDb.findUnique({ where: { brandId: brand.id } }))?.publishedAt).toBeInstanceOf(Date);
    expect(await prisma.growthEvent.count({ where: { name: "media_kit_published" } })).toBe(1);
  });

  it("page publique : publiée et palier payant seulement ; rien de privé dedans", async () => {
    const { user, brand } = await seedBrand({ comp: "PRO" });
    expect(await getPublicKit(brand.slug)).toBeNull(); // pas encore publiée
    await mediaKitDb.upsert({ where: { brandId: brand.id }, create: { brandId: brand.id, published: true, headline: "Café" }, update: { published: true } });
    const kit = await getPublicKit(brand.slug);
    expect(kit).toMatchObject({ slug: brand.slug, headline: "Café", stats: { totals: { audience: 14_000 } } });
    expect(JSON.stringify(kit)).not.toContain("AT-SECRET");
    expect(await getPublicKit("inconnue")).toBeNull();
    expect(await getPublicKit("../etc")).toBeNull();

    // Palier perdu : la page disparaît, même si le kit est encore marqué publié.
    await prisma.user.update({ where: { id: user.id }, data: { compPlan: null } });
    expect(await getPublicKit(brand.slug)).toBeNull();
  });

  it("ouvertures : un visiteur une fois par jour ; ni les membres, ni les robots, ni un kit non publié", async () => {
    const { user, brand } = await seedBrand({ comp: "PRO" });
    expect((await view(brand.slug, "198.51.100.1")).status).toBe(204); // pas encore publié
    expect(await prisma.publicToolUsage.count({ where: { tool: { startsWith: "ratelimit:kitview:" } } })).toBe(0); // rien de consommé
    await mediaKitDb.upsert({ where: { brandId: brand.id }, create: { brandId: brand.id, published: true }, update: { published: true } });

    await view(brand.slug, "198.51.100.1");
    await view(brand.slug, "198.51.100.1");
    await view(brand.slug, "198.51.100.2");
    await view(brand.slug, "198.51.100.3", "WhatsApp/2.23");
    session.userId = user.id;
    await view(brand.slug, "198.51.100.4");
    session.userId = null;
    await view("inconnue", "198.51.100.5");

    const row = await mediaKitDb.findUnique({ where: { brandId: brand.id } });
    expect(row?.views).toBe(2);
    expect(row?.lastViewedAt).toBeInstanceOf(Date);
    const usage = await prisma.publicToolUsage.findMany({ where: { tool: { startsWith: "ratelimit:kitview:" } } });
    expect(usage.every((u) => /^[a-f0-9]{64}$/.test(u.ipHash))).toBe(true);
  });

  it("fin de l'essai Pro : le kit est dépublié, ses réglages restent", async () => {
    const { user, brand } = await seedBrand();
    await prisma.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    await mediaKitDb.upsert({ where: { brandId: brand.id }, create: { brandId: brand.id, published: true, headline: "Gardée" }, update: {} });
    await applyTrialExpirations();
    expect(await mediaKitDb.findUnique({ where: { brandId: brand.id } })).toMatchObject({ published: false, headline: "Gardée" });
  });

  it("suppression de la marque : le kit part avec", async () => {
    const { brand } = await seedBrand();
    await mediaKitDb.upsert({ where: { brandId: brand.id }, create: { brandId: brand.id }, update: {} });
    await prisma.brand.delete({ where: { id: brand.id } });
    expect(await mediaKitDb.count({ where: { brandId: brand.id } })).toBe(0);
  });
});
