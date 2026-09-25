import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";
import { AppShell } from "@/components/dashboard/app-shell";
import { AiAssistantLazy } from "@/components/dashboard/ai-assistant-lazy";
import { AiAssistantProvider } from "@/components/dashboard/ai-assistant-context";
import { ProfilePanelLazy } from "@/components/dashboard/profile-panel-lazy";
import { UpgradeModalProvider } from "@/components/billing/upgrade-modal";
import { TrialEndedNotice } from "@/components/billing/trial-banner";
import { BrandProvider } from "@/components/brand-context";
import { ToastProvider } from "@/components/dashboard/toast";
import { ConfirmProvider } from "@/components/dashboard/confirm";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { Starfield } from "@/components/starfield";
import { AppThemeParticles } from "@/components/theme-particles";
import { MilestoneCelebrationProvider } from "@/components/milestone-celebration";
import { CosmeticsEffects } from "@/components/cosmetics-effects";
import { FocusGate } from "@/components/focus-gate";
import { isOwnerEmail, readOwnerModeCookie } from "@/lib/dev-preview";
import { TestModeBar } from "@/components/dashboard/test-mode-bar";
import { EmailVerifyBanner } from "@/components/dashboard/email-verify-banner";
import { Providers } from "@/components/providers";
import { buildMe } from "@/lib/me";
import { resolveActiveBrand } from "@/lib/server-data/brands";
import { asJson, getAiStatus, getConnectionsList } from "@/lib/server-data/brand-data";
import { SeededData } from "@/lib/data/swr-config";
import { aiStatusKey, connectionsKey } from "@/lib/data/keys";

// CSP stricte (nonce différent à chaque requête, voir src/lib/csp.ts) :
// rendu à chaque visite, jamais pré-généré.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Lien privé « Test / QA » (voir /dev-preview et navigation.ts) : réservé
  // au seul compte propriétaire du site, jamais visible pour les autres.
  const isOwner = isOwnerEmail(session.user?.email);
  // Mode de test actif (voir dev-preview.ts) : bandeau « Quitter le mode test ».
  const ownerMode = isOwner ? readOwnerModeCookie() : null;

  // Le compte actif est mémorisé dans le sélecteur multi-compte (voir
  // multi-account.ts) côté client, au chargement de AccountSwitcher — PAS
  // ici : Next.js interdit d'écrire un cookie depuis un Server Component.
  const oauth = getEnabledOAuthProviders();

  // Lot 10 : préparé ici, en parallèle, ce que le navigateur demandait en
  // cascade après le chargement du JavaScript (session, /api/me,
  // /api/brands, puis comptes connectés et statut IA de la marque active).
  // Uniquement au premier affichage : les navigations suivantes ne
  // réexécutent pas ce layout.
  const userId = (session.user as { id: string }).id;
  const [me, shell] = await Promise.all([buildMe(session), resolveActiveBrand(userId)]);
  const brandId = shell.activeBrand?.id ?? null;
  const [connections, aiStatus] = brandId ? await Promise.all([getConnectionsList(brandId), getAiStatus(brandId)]) : [null, null];
  const seeds: Record<string, unknown> =
    brandId && connections && aiStatus ? { [connectionsKey(brandId)]: asJson(connections), [aiStatusKey(brandId)]: aiStatus } : {};

  return (
    // Providers (session + bootstrap /api/me + thème + fond + thème étoilé +
    // cosmétiques + mode clair) : montés ICI et non dans la mise en page
    // racine, pour que les pages publiques restent stables et légères.
    <Providers session={asJson(session)} me={me}>
      <SeededData entries={seeds} at={Date.now()}>
      <BrandProvider initialBrands={shell.brands} initialActiveBrandId={brandId} activeFromCookie={shell.fromCookie}>
        <ToastProvider>
          <MilestoneCelebrationProvider>
            <ConfirmProvider>
              {/* Lien « Aller au contenu » : premier élément focusable,
                  visible uniquement au focus (voir .skip-link). */}
              <a href="#contenu" className="skip-link">
                Aller au contenu
              </a>
              <Starfield />
              {/* Particules des thèmes Nova et Prisme (voir theme-particles.tsx). */}
              <AppThemeParticles />
              {/* Assistant « Demander à Nebula » : le provider enveloppe le
                  shell pour que le bouton de l'en-tête, le bouton flottant et
                  les pages (ex. section Miniature) pilotent le même tiroir. */}
              {/* Paywall contextuel (UpgradeModal) : disponible partout dans
                  l'application connectée — pages, tiroir IA, composer. */}
              <UpgradeModalProvider>
                <AiAssistantProvider>
                  <AppShell oauth={oauth} isOwner={isOwner}>
                    {children}
                  </AppShell>
                  <AiAssistantLazy />
                </AiAssistantProvider>
                {/* Panneau « Mon profil » (badges, easter eggs, parrainage) —
                    ouvert depuis la Communauté ou le menu du compte. */}
                <ProfilePanelLazy />
                <TrialEndedNotice />
              </UpgradeModalProvider>
              <CommandPalette isOwner={isOwner} />
              <TestModeBar mode={ownerMode} />
              {/* Adresse e-mail pas encore confirmée (audit sécurité, lot 1). */}
              <EmailVerifyBanner />
              <CosmeticsEffects />
              {/* Easter eggs ambiants et toasts « succès débloqué » : montés
                  seulement hors Mode focus (voir focus-gate.tsx). */}
              <FocusGate />
            </ConfirmProvider>
          </MilestoneCelebrationProvider>
        </ToastProvider>
      </BrandProvider>
      </SeededData>
    </Providers>
  );
}
