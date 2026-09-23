"use client";

import { SessionProvider } from "next-auth/react";
import { BootstrapProvider } from "@/components/bootstrap-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundProvider } from "@/components/background-provider";
import { ModeProvider } from "@/components/mode-provider";
import { StarfieldProvider } from "@/components/starfield-provider";
import { CosmeticsProvider } from "@/components/cosmetics-provider";

// Fournisseurs de l'APPLICATION CONNECTÉE uniquement (montés par
// src/app/(dashboard)/layout.tsx, jamais par la mise en page racine) : la
// session NextAuth côté client, puis le bootstrap (/api/me, UNE requête pour
// toutes les préférences du compte) dont dérivent les fournisseurs
// d'apparence — avant le Lot 3, chacun d'eux lançait son propre appel
// /api/settings/* au montage.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BootstrapProvider>
        <ThemeProvider>
          <BackgroundProvider>
            <StarfieldProvider>
              <CosmeticsProvider>
                <ModeProvider>{children}</ModeProvider>
              </CosmeticsProvider>
            </StarfieldProvider>
          </BackgroundProvider>
        </ThemeProvider>
      </BootstrapProvider>
    </SessionProvider>
  );
}
