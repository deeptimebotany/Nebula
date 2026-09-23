import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";
import { AppShell } from "@/components/dashboard/app-shell";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
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
              <AppShell oauth={oauth} isOwner={isOwner}>
                {children}
              </AppShell>
              <AiAssistant />
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
