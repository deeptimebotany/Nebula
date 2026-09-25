// « Bootstrap » de l'application connectée (lot 3 ; partagé au lot 10) :
// TOUT ce que le shell et les fournisseurs de préférences ont besoin de
// savoir au démarrage. Servi par GET /api/me ET préparé par le layout de
// l'application au premier affichage (plus d'appel /api/me à attendre :
// thème, fond et cosmétiques justes dès la première image).
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { countOwnedBrands, getUserPlan } from "@/lib/billing/plan";
import { getAppearanceAccess } from "@/lib/appearance-access";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { DEFAULT_THEME_KEY, THEMES, canUseTheme } from "@/lib/themes";
import { DEFAULT_BACKGROUND_KEY, canUseBackground, findBackground, resolveBackgroundKey } from "@/lib/backgrounds";
import type { MeResponse } from "@/lib/me-types";
import { EASTER_EGGS } from "@/lib/easter-eggs-registry";
import { LINKED_EGG_KEYS, rankAt } from "@/lib/reussites/catalog";
import { unseenReussites } from "@/lib/reussites/engine";
import { userReussitesDb } from "@/lib/prisma-extra";
import { isOfferActive, trialDaysLeft } from "@/lib/trial";
import { availableNetworks } from "@/lib/network-availability";

/** Bootstrap du compte de la session, ou null si le compte n'existe plus. */
export async function buildMe(session: Session): Promise<MeResponse | null> {
  if (!session.user) return null;
  const sessionUser = session.user;
  const userId = (sessionUser as { id: string }).id;

  const [user, planInfo, brandsOwned, access, eggsFound] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        emailVerifiedAt: true,
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
    getAppearanceAccess(userId, sessionUser.email),
    prisma.easterEggFound.count({ where: { userId, key: { notIn: LINKED_EGG_KEYS } } })
  ]);
  // Réussites : valeurs gardées à jour par le moteur (src/lib/reussites/engine.ts).
  const reussitesRow = await userReussitesDb
    .findUnique({ where: { id: userId }, select: { creatorXp: true, creatorLevel: true, reussitesSeenAt: true } })
    .catch(() => null);
  // Palier enregistré (retenu par la condition de variété, lot B).
  const levelInfo = rankAt(reussitesRow?.creatorXp ?? 0, reussitesRow?.creatorLevel ?? 1);
  const unseen = await unseenReussites(userId, reussitesRow?.reussitesSeenAt ? new Date(reussitesRow.reussitesSeenAt) : null).catch(() => 0);
  if (!user) return null;

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
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl ?? sessionUser.image ?? null, emailVerified: Boolean(user.emailVerifiedAt) },
    plan: planInfo.plan,
    maxBrands: planInfo.maxBrands,
    brandsOwned,
    billingEnabled: isBillingEnabled(),
    isOwner: access.isOwner,
    // Easter eggs devenus des accomplissements : comptés dans Réussites, plus ici.
    eggs: { found: eggsFound, total: EASTER_EGGS.length - LINKED_EGG_KEYS.length },
    reussites: { level: levelInfo.level, name: levelInfo.name, pct: levelInfo.pct, xp: levelInfo.xp, nextXp: levelInfo.nextXp, unseen },
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
    referralCode: user.referralCode ?? null,
    networks: availableNetworks()
  };
  return body;
}

