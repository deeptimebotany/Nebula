import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countOwnedBrands, getUserPlan } from "@/lib/billing/plan";
import { getAppearanceAccess } from "@/lib/appearance-access";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { DEFAULT_THEME_KEY, THEMES, canUseTheme } from "@/lib/themes";
import { DEFAULT_BACKGROUND_KEY, canUseBackground, findBackground, resolveBackgroundKey } from "@/lib/backgrounds";
import type { MeResponse } from "@/lib/me-types";
import { EASTER_EGGS } from "@/lib/easter-eggs-registry";
import { isOfferActive, trialDaysLeft } from "@/lib/trial";

// Toujours réévalué à la demande : le palier et les droits d'apparence
// doivent refléter l'état réel au moment de l'appel.
export const dynamic = "force-dynamic";

// GET /api/me — « bootstrap » de l'application connectée : TOUT ce que le
// shell et les fournisseurs de préférences ont besoin de savoir au
// démarrage, en UNE requête. Avant ce fichier, l'ouverture du tableau de
// bord déclenchait sept appels séparés (thème, fond, mode, thème étoilé,
// cosmétiques, palier, marque blanche) qui répétaient chacun la vérification
// de session et la lecture du même enregistrement User.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const [user, planInfo, brandsOwned, access, eggsFound] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        themePreference: true,
        backgroundPreference: true,
        colorMode: true,
        focusMode: true,
        notifyOnFailure: true,
        starfieldEnabled: true,
        enabledCosmetics: true,
        whiteLabelBrandName: true,
        whiteLabelLogoUrl: true,
        trialEndsAt: true,
        trialEndedNoticeAt: true,
        offerExpiresAt: true,
        offerUsedAt: true,
        firstPaidAt: true,
        bonusMonths: true,
        paidInvoices: true,
        lifecycleEmails: true,
        referralPromptsSeen: true,
        referralCode: true
      }
    }),
    getUserPlan(userId),
    countOwnedBrands(userId),
    getAppearanceAccess(userId, session.user.email),
    prisma.easterEggFound.count({ where: { userId } })
  ]);
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  // Avantages de palier = palier ACTUEL, jamais seulement la préférence
  // enregistrée (vérification du 24/09/2026) : un compte qui perd son
  // abonnement (fin d'essai, résiliation, accès partenaire expiré, passage
  // d'Agence à Pro…) retombe sur le thème/fond par défaut et perd les
  // cosmétiques et la marque blanche de son ancien palier. Ses choix restent
  // enregistrés : ils reviennent tout seuls s'il se réabonne.
  const effPlan = access.effectivePlan;
  const savedTheme = THEMES.find((t) => t.key === (user.themePreference || DEFAULT_THEME_KEY));
  const themeEggFound =
    !savedTheme?.requiresEgg || effPlan === "ALL"
      ? true
      : Boolean(await prisma.easterEggFound.findUnique({ where: { userId_key: { userId, key: savedTheme.requiresEgg } }, select: { id: true } }));
  const effectiveTheme = savedTheme && themeEggFound && (effPlan === "ALL" || canUseTheme(savedTheme, effPlan)) ? savedTheme.key : DEFAULT_THEME_KEY;
  const savedBackground = findBackground(user.backgroundPreference || DEFAULT_BACKGROUND_KEY);
  const effectiveBackground =
    savedBackground.requiresPlan && effPlan !== "ALL" && !canUseBackground(savedBackground, effPlan) ? DEFAULT_BACKGROUND_KEY : resolveBackgroundKey(savedBackground.key);
  const allowedCosmetics = new Set(access.cosmeticsAllowedKeys);
  const whiteLabelAllowed = effPlan === "ALL" || effPlan === "AGENCY";

  const body: MeResponse = {
    // Pas encore de photo en base : celle du compte Google/Apple de la
    // session, pour que « Mon profil » affiche la même que le sélecteur de
    // compte en haut à droite.
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl ?? session.user.image ?? null },
    plan: planInfo.plan,
    maxBrands: planInfo.maxBrands,
    brandsOwned,
    billingEnabled: isBillingEnabled(),
    isOwner: access.isOwner,
    eggs: { found: eggsFound, total: EASTER_EGGS.length },
    previewPlan: access.previewPlan,
    theme: effectiveTheme,
    // Fond retiré lors du tri du 24/09/2026 → son remplaçant ; fond de
    // palier non couvert par le palier actuel → fond par défaut.
    background: effectiveBackground,
    mode: user.colorMode === "light" ? "light" : "dark",
    // Colonne ajoutée au Lot 3 : `?? true` couvre une base pas encore migrée.
    focusMode: (user.focusMode as boolean | null | undefined) ?? true,
    notifyOnFailure: (user.notifyOnFailure as boolean | null | undefined) ?? true,
    starfield: { enabled: Boolean(user.starfieldEnabled), allowed: access.starfieldAllowed },
    // Seuls les cosmétiques encore autorisés (palier actuel ou easter egg).
    cosmetics: { enabled: ((user.enabledCosmetics as string[] | undefined) ?? []).filter((k) => allowedCosmetics.has(k)), allowedKeys: access.cosmeticsAllowedKeys },
    // Marque blanche : palier Agence uniquement.
    whiteLabel: whiteLabelAllowed ? { brandName: user.whiteLabelBrandName ?? null, logoUrl: user.whiteLabelLogoUrl ?? null } : { brandName: null, logoUrl: null },
    onTrial: planInfo.onTrial,
    trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
    trialDaysLeft: planInfo.onTrial ? trialDaysLeft(user.trialEndsAt) : 0,
    // La modale de fin d'essai ne concerne que les comptes qui ONT eu un
    // essai, dont il est fini, non payants, et qui ne l'ont pas encore vue.
    trialEndedNoticeDue: Boolean(user.trialEndsAt) && !planInfo.onTrial && !planInfo.paid && !user.trialEndedNoticeAt,
    paid: planInfo.paid,
    pausedUntil: planInfo.pausedUntil ? planInfo.pausedUntil.toISOString() : null,
    comp: planInfo.comp ? { until: planInfo.comp.until ? planInfo.comp.until.toISOString() : null } : null,
    offerExpiresAt: !planInfo.paid && !user.firstPaidAt && isOfferActive(user.offerExpiresAt, user.offerUsedAt) ? user.offerExpiresAt!.toISOString() : null,
    bonusMonths: user.bonusMonths ?? 0,
    annualNudge: planInfo.paid && planInfo.interval === "month" && (user.paidInvoices ?? 0) >= 3,
    lifecycleEmails: (user.lifecycleEmails as boolean | null | undefined) ?? true,
    referralPromptsSeen: Array.isArray(user.referralPromptsSeen) ? (user.referralPromptsSeen as string[]) : [],
    referralCode: user.referralCode ?? null
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

// PATCH /api/me { avatarUrl } — photo de profil choisie dans « Mon profil »
// (envoyée d'abord via /api/media/thumbnails/upload). null = retirer.
const patchSchema = z.object({ avatarUrl: z.string().url().max(2048).nullable() });

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Photo invalide." }, { status: 400 });
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: parsed.data.avatarUrl }, select: { avatarUrl: true } });
  return NextResponse.json({ avatarUrl: user.avatarUrl ?? null });
}
