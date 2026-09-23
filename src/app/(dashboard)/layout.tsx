import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";
import { AppShell } from "@/components/dashboard/app-shell";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { AiAssistantProvider } from "@/components/dashboard/ai-assistant-context";
import { ProfilePanel } from "@/components/dashboard/profile-panel";
import { UpgradeModalProvider } from "@/components/billing/upgrade-modal";
import { TrialEndedNotice } from "@/components/billing/trial-banner";
import { BrandProvider } from "@/components/brand-context";
import { ToastProvider } from "@/components/dashboard/toast";
import { ConfirmProvider } from "@/components/dashboard/confirm";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { Starfield } from "@/components/starfield";
import { MilestoneCelebrationProvider } from "@/components/milestone-celebration";
import { CosmeticsEffects } from "@/components/cosmetics-effects";
import { FocusGate } from "@/components/focus-gate";
import { isOwnerEmail } from "@/lib/dev-preview";
import { Providers } from "@/components/providers";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Lien privé « Test / QA » (voir /dev-preview et navigation.ts) : réservé
  // au seul compte propriétaire du site, jamais visible pour les autres.
  const isOwner = isOwnerEmail(session.user?.email);

  // Le compte actif est mémorisé dans le sélecteur multi-compte (voir
  // multi-account.ts) côté client, au chargement de AccountSwitcher — PAS
  // ici : Next.js interdit d'écrire un cookie depuis un Server Component.
  const oauth = getEnabledOAuthProviders();

  return (
    // Providers (session + bootstrap /api/me + thème + fond + thème étoilé +
    // cosmétiques + mode clair) : montés ICI et non dans la mise en page
    // racine, pour que les pages publiques restent stables et légères.
    <Providers>
      <BrandProvider>
        <ToastProvider>
          <MilestoneCelebrationProvider>
            <ConfirmProvider>
              {/* Lien « Aller au contenu » : premier élément focusable,
                  visible uniquement au focus (voir .skip-link). */}
              <a href="#contenu" className="skip-link">
                Aller au contenu
              </a>
              <Starfield />
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
                  <AiAssistant />
                </AiAssistantProvider>
                {/* Panneau « Mon profil » (badges, easter eggs, parrainage) —
                    ouvert depuis la Communauté ou le menu du compte. */}
                <ProfilePanel />
                <TrialEndedNotice />
              </UpgradeModalProvider>
              <CommandPalette isOwner={isOwner} />
              <CosmeticsEffects />
              {/* Easter eggs ambiants et toasts « succès débloqué » : montés
                  seulement hors Mode focus (voir focus-gate.tsx). */}
              <FocusGate />
            </ConfirmProvider>
          </MilestoneCelebrationProvider>
        </ToastProvider>
      </BrandProvider>
    </Providers>
  );
}
