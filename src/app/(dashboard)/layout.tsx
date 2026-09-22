import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";
import { TopNav } from "@/components/dashboard/topnav";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { BrandProvider } from "@/components/brand-context";
import { ToastProvider } from "@/components/dashboard/toast";
import { ConfirmProvider } from "@/components/dashboard/confirm";
import { EasterEggs } from "@/components/easter-eggs";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { Starfield } from "@/components/starfield";
import { MilestoneCelebrationProvider } from "@/components/milestone-celebration";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Le compte actif est mémorisé dans le sélecteur multi-compte (voir
  // multi-account.ts) côté client, au chargement de AccountSwitcher — PAS
  // ici : Next.js interdit d'écrire un cookie depuis un Server Component
  // "normal" comme cette mise en page (seulement depuis une Route Handler
  // ou une Server Action), et c'est justement ce qui cassait tout le site.
  const oauth = getEnabledOAuthProviders();

  return (
    <BrandProvider>
      <ToastProvider>
        <MilestoneCelebrationProvider>
          <ConfirmProvider>
            <div className="flex min-h-screen flex-col">
              <Starfield />
              <TopNav oauth={oauth} />
              <main className="noise-grid flex-1 overflow-y-auto px-4 py-8 sm:px-8">
                <div className="mx-auto max-w-7xl">{children}</div>
              </main>
              <AiAssistant />
              <EasterEggs />
              <CommandPalette />
            </div>
          </ConfirmProvider>
        </MilestoneCelebrationProvider>
      </ToastProvider>
    </BrandProvider>
  );
}
