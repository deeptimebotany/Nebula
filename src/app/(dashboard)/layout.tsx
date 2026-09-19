import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { TopNav } from "@/components/dashboard/topnav";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { BrandProvider } from "@/components/brand-context";
import { ToastProvider } from "@/components/dashboard/toast";
import { ConfirmProvider } from "@/components/dashboard/confirm";
import { EasterEggs } from "@/components/easter-eggs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <BrandProvider>
      <ToastProvider>
        <ConfirmProvider>
          <div className="flex min-h-screen flex-col">
            <TopNav />
            <main className="noise-grid flex-1 overflow-y-auto px-4 py-8 sm:px-8">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
            <AiAssistant />
            <EasterEggs />
          </div>
        </ConfirmProvider>
      </ToastProvider>
    </BrandProvider>
  );
}
