import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getEnabledOAuthProviders } from "@/lib/oauth-providers";
import { rememberCurrentSession } from "@/lib/multi-account";
import { TopNav } from "@/components/dashboard/topnav";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { BrandProvider } from "@/components/brand-context";
import { ToastProvider } from "@/components/dashboard/toast";
import { ConfirmProvider } from "@/components/dashboard/confirm";
import { EasterEggs } from "@/components/easter-eggs";
import { CommandPalette } from "@/components/dashboard/command-palette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Mémorise ce compte dans le sélecteur multi-compte (voir
  // multi-account.ts) à CHAQUE chargement authentifié, pas seulement après
  // le flux "+" de account-switcher.tsx — couvre aussi la connexion normale
  // depuis /login (credentials ou Google), qui ne passe pas par ce flux.
  const uid = (session.user as { id?: string }).id;
  if (uid) rememberCurrentSession(uid);
  const oauth = getEnabledOAuthProviders();

  return (
    <BrandProvider>
      <ToastProvider>
        <ConfirmProvider>
          <div className="flex min-h-screen flex-col">
            <TopNav oauth={oauth} />
            <main className="noise-grid flex-1 overflow-y-auto px-4 py-8 sm:px-8">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
            <AiAssistant />
            <EasterEggs />
            <CommandPalette />
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </BrandProvider>
  );
}
