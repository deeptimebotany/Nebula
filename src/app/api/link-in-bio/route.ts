import { unlockKeysFor } from "@/lib/reussites/unlocks";
import { refreshReussites } from "@/lib/reussites/engine";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getOrCreateLinkPage, assertBrandMembership } from "@/lib/link-in-bio";
import { THEMES, canUseTheme } from "@/lib/themes";
import { getBrandPlan } from "@/lib/billing/plan";
import { FRAME_NONE, MILLION_FOLLOWERS_EGG, bioCardSize, findBioFrame, frameFitsTheme, unlockedFrameKeys } from "@/lib/bio-frames";
import { checkAudienceMilestones } from "@/lib/easter-eggs/audience";
import { ownerUnlocksAll, resolvePreviewPlan } from "@/lib/dev-preview";
import { invalidateLinkPage } from "@/lib/link-in-bio-cache";
import { invalidateMediaKit } from "@/lib/media-kit/cache";

// Cadres de page bio débloqués par CE compte (easter eggs trouvés). Le
// compte propriétaire les a tous seulement en mode « Tout déverrouillé »
// (voir dev-preview.ts) — son état réel sinon.
async function eggThemesUnlockedFor(userId: string, email: string | null | undefined): Promise<string[]> {
  const eggThemes = THEMES.filter((t) => t.requiresEgg);
  if (ownerUnlocksAll(email)) return eggThemes.map((t) => t.key);
  const found: { key: string }[] = await prisma.easterEggFound.findMany({
    where: { userId, key: { in: eggThemes.map((t) => t.requiresEgg as string) } },
    select: { key: true }
  });
  const keys = new Set(found.map((f) => f.key));
  return eggThemes.filter((t) => keys.has(t.requiresEgg as string)).map((t) => t.key);
}

async function framesUnlockedFor(userId: string, email: string | null | undefined): Promise<string[]> {
  if (ownerUnlocksAll(email)) return unlockedFrameKeys([], true);
  // Easter eggs trouvés + récompenses Réussites (cadres « Carrefour », « Astre »).
  return unlockedFrameKeys(await unlockKeysFor(userId));
}

async function cardSizeFor(brandId: string, email: string | null | undefined) {
  if (ownerUnlocksAll(email)) return bioCardSize("AGENCY", true);
  const owner = await prisma.membership.findFirst({ where: { brandId, role: "OWNER" }, orderBy: { id: "asc" }, select: { userId: true } });
  const million = owner ? (await unlockKeysFor(owner.userId)).has(MILLION_FOLLOWERS_EGG) : false;
  const plan = resolvePreviewPlan(email) ?? (await getBrandPlan(brandId)).plan;
  return bioCardSize(plan, million);
}

// GET/PATCH /api/link-in-bio?brandId=... — page "link in bio" de la marque
// active, éditée depuis /link-in-bio (voir ce dossier pour l'UI). Créée à la
// volée au premier GET (voir getOrCreateLinkPage) : pas de flux de création
// séparé, la marque a toujours "sa" page, publiée ou non.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const [linkPage, brand] = await Promise.all([
    getOrCreateLinkPage(brandId),
    prisma.brand.findUnique({ where: { id: brandId }, select: { slug: true, name: true, logoUrl: true } })
  ]);

  // Une page sans titre ni photo hérite du nom et du logo de la marque
  // (même valeur que celle affichée sur /l/[slug]).
  const merged = { ...linkPage, title: linkPage.title || brand?.name || "", avatarUrl: linkPage.avatarUrl ?? brand?.logoUrl ?? null };
  // Seuils d'audience revérifiés à chaque ouverture de la Page bio, pour
  // qu'un cadre fraîchement mérité apparaisse tout de suite.
  await checkAudienceMilestones(userId);
  const unlockedFrames = await framesUnlockedFor(userId, session.user.email);
  // Thèmes easter egg (Nova…) déjà trouvés : proposés dans le choix du thème.
  const unlockedThemes = await eggThemesUnlockedFor(userId, session.user.email);
  // Taille de la carte (même règle que la page publique, voir
  // link-in-bio-public.ts) : palier de la marque + palier du million
  // d'abonnés de son propriétaire. Compte propriétaire du site : suit son
  // mode de test (« Tout déverrouillé » = la plus grande).
  const cardSize = await cardSizeFor(brandId, session.user.email);
  return NextResponse.json({ linkPage: merged, slug: brand?.slug, unlockedFrames, unlockedThemes, cardSize });
}

const bodySchema = z.object({
  brandId: z.string().min(1),
  title: z.string().max(60).optional(),
  bio: z.string().max(280).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  theme: z.string().optional(),
  frame: z.string().nullable().optional(),
  published: z.boolean().optional()
});

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  const { brandId, ...data } = parsed.data;

  const userId = (session.user as { id: string }).id;
  if (!(await assertBrandMembership(userId, brandId))) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  const pickedTheme = data.theme ? THEMES.find((t) => t.key === data.theme) : undefined;
  if (data.theme && !pickedTheme) {
    return NextResponse.json({ error: "Thème inconnu." }, { status: 400 });
  }
  // Thème de palier : revérifié ici (l'éditeur le grise déjà), d'après le
  // palier de la marque. Le compte propriétaire garde tout déverrouillé.
  if (pickedTheme?.requiresEgg && !(await eggThemesUnlockedFor(userId, session.user.email)).includes(pickedTheme.key)) {
    return NextResponse.json({ error: `Le thème « ${pickedTheme.label} » se débloque en trouvant son easter egg.` }, { status: 403 });
  }
  if (pickedTheme?.requiresPlan && !ownerUnlocksAll(session.user.email)) {
    const plan = resolvePreviewPlan(session.user.email) ?? (await getBrandPlan(brandId)).plan;
    if (!canUseTheme(pickedTheme, plan)) {
      return NextResponse.json({ error: `Le thème « ${pickedTheme.label} » nécessite le palier ${pickedTheme.requiresPlan}.` }, { status: 403 });
    }
  }

  if (data.frame !== undefined && data.frame !== null && data.frame !== FRAME_NONE) {
    const def = findBioFrame(data.frame);
    if (!def) return NextResponse.json({ error: "Cadre inconnu." }, { status: 400 });
    const unlocked = await framesUnlockedFor(userId, session.user.email);
    if (!unlocked.includes(def.key)) {
      return NextResponse.json({ error: "Ce cadre n'est pas encore débloqué." }, { status: 403 });
    }
  }

  const current = await getOrCreateLinkPage(brandId);

  // Cadres et thèmes liés (voir frameFitsTheme) : un cadre choisi doit aller
  // avec le thème de la page ; un nouveau thème qui ne va pas avec le cadre
  // enregistré remet le cadre sur « Automatique » (frameReset dans la
  // réponse, pour que l'éditeur le signale).
  const nextTheme = data.theme ?? (current as { theme: string }).theme;
  const pickedFrame = data.frame !== undefined && data.frame !== null && data.frame !== FRAME_NONE ? findBioFrame(data.frame) : undefined;
  if (pickedFrame && !frameFitsTheme(pickedFrame, nextTheme)) {
    return NextResponse.json({ error: "Ce cadre ne va pas avec le thème de la page : changez de thème ou choisissez un autre cadre." }, { status: 400 });
  }
  let frameReset: string | null = null;
  if (data.theme !== undefined && data.frame === undefined) {
    const savedFrame = findBioFrame((current as { frame?: string | null }).frame);
    if (savedFrame && !frameFitsTheme(savedFrame, data.theme)) {
      data.frame = null;
      frameReset = savedFrame.label;
    }
  }

  // Titre de la Page bio = nom de la marque, photo = logo de la marque
  // (décision du 24/09/2026) : le sélecteur de marque, en haut à gauche,
  // suit immédiatement ce qui est enregistré ici. Un titre vide ne renomme
  // pas la marque (la page publique retombe alors sur brand.name).
  const brandPatch: { name?: string; logoUrl?: string | null } = {};
  if (data.title !== undefined && data.title.trim().length >= 2) brandPatch.name = data.title.trim();
  if (data.avatarUrl !== undefined) brandPatch.logoUrl = data.avatarUrl;
  const brand = Object.keys(brandPatch).length ? await prisma.brand.update({ where: { id: brandId }, data: brandPatch, select: { id: true, name: true, logoUrl: true } }) : null;

  const linkPage = await prisma.linkPage.update({
    where: { brandId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      ...(data.theme !== undefined ? { theme: data.theme } : {}),
      ...(data.frame !== undefined ? { frame: data.frame } : {}),
      ...(data.published !== undefined ? { published: data.published } : {})
    },
    include: { links: { orderBy: { order: "asc" } } }
  });

  // Réussites : « Vitrine » (page bio publiée).
  if (data.published === true) await refreshReussites(userId);
  // Page publique à jour immédiatement (cache, audit performance lot 4).
  await invalidateLinkPage(brandId);
  // Nom et logo de la marque, partagés avec le media kit public.
  if (brand) await invalidateMediaKit(brandId);
  return NextResponse.json({ linkPage, brand, frameReset });
}
