import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countOwnedBrands, getUserPlan } from "@/lib/billing/plan";
import { getAppearanceAccess } from "@/lib/appearance-access";
import { isBillingEnabled } from "@/lib/billing/stripe";
import { DEFAULT_THEME_KEY } from "@/lib/themes";
import { DEFAULT_BACKGROUND_KEY } from "@/lib/backgrounds";
import type { MeResponse } from "@/lib/me-types";

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

  const [user, planInfo, brandsOwned, access] = await Promise.all([
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
        whiteLabelLogoUrl: true
      }
    }),
    getUserPlan(userId),
    countOwnedBrands(userId),
    getAppearanceAccess(userId, session.user.email)
  ]);
  if (!user) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const body: MeResponse = {
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl ?? null },
    plan: planInfo.plan,
    maxBrands: planInfo.maxBrands,
    brandsOwned,
    billingEnabled: isBillingEnabled(),
    isOwner: access.isOwner,
    previewPlan: access.previewPlan,
    theme: user.themePreference || DEFAULT_THEME_KEY,
    background: user.backgroundPreference || DEFAULT_BACKGROUND_KEY,
    mode: user.colorMode === "light" ? "light" : "dark",
    // Colonne ajoutée au Lot 3 : `?? true` couvre une base pas encore migrée.
    focusMode: (user.focusMode as boolean | null | undefined) ?? true,
    notifyOnFailure: (user.notifyOnFailure as boolean | null | undefined) ?? true,
    starfield: { enabled: Boolean(user.starfieldEnabled), allowed: access.starfieldAllowed },
    cosmetics: { enabled: (user.enabledCosmetics as string[] | undefined) ?? [], allowedKeys: access.cosmeticsAllowedKeys },
    whiteLabel: { brandName: user.whiteLabelBrandName ?? null, logoUrl: user.whiteLabelLogoUrl ?? null }
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
