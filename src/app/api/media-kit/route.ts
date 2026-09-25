import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requireBrandMembership } from "@/lib/brand-access";
import { prisma } from "@/lib/prisma";
import { getBrandPlan } from "@/lib/billing/plan";
import { trackGrowth } from "@/lib/growth";
import { cleanOffers, getKitEditor, getOrCreateMediaKit, mediaKitDb, settingsFromRow } from "@/lib/media-kit/load";
import { invalidateMediaKit } from "@/lib/media-kit/cache";
import { ABOUT_MAX, HEADLINE_MAX, MAX_FEATURED_POSTS, MAX_OFFERS, OFFER_LABEL_MAX, OFFER_PRICE_MAX } from "@/lib/media-kit/types";

// Media kit public (produit n°10), éditeur /media-kit.
//  GET ?brandId=… : réglages, comptes, publications proposées, aperçu avec
//       les vrais chiffres (visible aussi en Gratuit), vues du kit.
//  PUT { brandId, …réglages } : enregistre. Publier demande un palier payant
//       (402 `reason: "media_kit"` sinon) ; le reste s'enregistre dans tous
//       les paliers, pour qu'un kit préparé en Gratuit parte dès le passage en Pro.
// Les chiffres ne se règlent pas : seuls les comptes et les publications
// affichés, et le texte.

async function sessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;
  const editor = await getKitEditor(brandId);
  if (!editor) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  return NextResponse.json(editor);
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  published: z.boolean().optional(),
  headline: z.string().max(HEADLINE_MAX * 2).optional(),
  about: z.string().max(ABOUT_MAX * 2).optional(),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .nullish()
    // Absent = inchangé ; vide ou null = retiré.
    .transform((v) => (v === undefined ? undefined : v ? v : null))
    .refine((v) => v == null || z.string().email().safeParse(v).success, "Adresse e-mail de contact invalide."),
  hiddenConnectionIds: z.array(z.string().max(40)).max(100).optional(),
  featuredPostIds: z.array(z.string().max(40)).max(MAX_FEATURED_POSTS * 2).optional(),
  offers: z
    .array(z.object({ label: z.string().max(OFFER_LABEL_MAX * 2), price: z.string().max(OFFER_PRICE_MAX * 2).default("") }))
    .max(MAX_OFFERS * 2)
    .optional()
});

export async function PUT(req: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const email = parsed.error.issues.find((i) => i.path.includes("contactEmail"));
    return NextResponse.json({ error: email ? "Adresse e-mail de contact invalide." : "Réglages invalides." }, { status: 400 });
  }
  const { brandId, ...patch } = parsed.data;
  const denied = await requireBrandMembership(userId, brandId);
  if (denied) return denied;

  const current = await getOrCreateMediaKit(brandId);
  const before = settingsFromRow(current);
  if (patch.published === true && !before.published && !(await getBrandPlan(brandId)).limits.mediaKitEnabled) {
    return NextResponse.json({ error: "Publier un media kit fait partie des paliers Pro et Agence. Votre kit reste enregistré.", reason: "media_kit" }, { status: 402 });
  }

  // Seuls des comptes et des publications de CETTE marque peuvent être désignés.
  const data: Record<string, unknown> = {};
  if (patch.hiddenConnectionIds) {
    const own = await prisma.socialConnection.findMany({ where: { brandId, id: { in: patch.hiddenConnectionIds } }, select: { id: true } });
    data.hiddenConnectionIds = own.map((c: { id: string }) => c.id);
  }
  if (patch.featuredPostIds) {
    const own = await prisma.postMetric.findMany({ where: { id: { in: patch.featuredPostIds }, connection: { brandId } }, select: { id: true } });
    const ok = new Set(own.map((m: { id: string }) => m.id));
    data.featuredPostIds = patch.featuredPostIds.filter((id, i, all) => ok.has(id) && all.indexOf(id) === i).slice(0, MAX_FEATURED_POSTS);
  }
  if (patch.headline !== undefined) data.headline = patch.headline.replace(/\s+/g, " ").trim().slice(0, HEADLINE_MAX);
  if (patch.about !== undefined) data.about = patch.about.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, ABOUT_MAX);
  if (patch.contactEmail !== undefined) data.contactEmail = patch.contactEmail;
  if (patch.offers) data.offers = cleanOffers(patch.offers);
  if (patch.published !== undefined) {
    data.published = patch.published;
    if (patch.published && !before.published) data.publishedAt = new Date();
  }

  await mediaKitDb.update({ where: { brandId }, data });
  await invalidateMediaKit(brandId);
  if (patch.published === true && !before.published) await trackGrowth("media_kit_published", {}, userId);

  const editor = await getKitEditor(brandId);
  return NextResponse.json(editor);
}
