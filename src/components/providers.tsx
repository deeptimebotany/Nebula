"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { DataCacheProvider } from "@/lib/data/swr-config";
import { BootstrapProvider } from "@/components/bootstrap-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundProvider } from "@/components/background-provider";
import { ModeProvider } from "@/components/mode-provider";
import { StarfieldProvider } from "@/components/starfield-provider";
import { CosmeticsProvider } from "@/components/cosmetics-provider";
import type { MeResponse } from "@/lib/me-types";

// Fournisseurs de l'APPLICATION CONNECTÉE uniquement (montés par
// src/app/(dashboard)/layout.tsx, jamais par la mise en page racine) : la
// session NextAuth côté client, puis le bootstrap (/api/me, UNE requête pour
// toutes les préférences du compte) dont dérivent les fournisseurs
// d'apparence — avant le Lot 3, chacun d'eux lançait son propre appel
// /api/settings/* au montage.
//
// Animations framer-motion (lot 6) : chaque composant animé porte sa propre
// racine MotionRoot (moteur chargé en différé + réglage « Réduire les
// animations » du système, voir motion/motion-root.tsx) — les pages sans
// animation ne chargent plus rien de framer-motion.
//
// Lot 10 : la session et le bootstrap (/api/me) sont préparés par le layout
// (serveur) et passés ici — plus d'appels /api/auth/session et /api/me à
// attendre au premier affichage, et thème, fond et cosmétiques justes dès la
// première image.
export function Providers({ children, session, me }: { children: React.ReactNode; session?: Session | null; me?: MeResponse | null }) {
  return (
    <SessionProvider session={session ?? undefined}>
      <DataCacheProvider>
        <BootstrapProvider initialData={me ?? undefined}>
          <ThemeProvider>
            <BackgroundProvider>
              <StarfieldProvider>
                <CosmeticsProvider>
                  <ModeProvider>
                    {children}
                  </ModeProvider>
                </CosmeticsProvider>
              </StarfieldProvider>
            </BackgroundProvider>
          </ThemeProvider>
        </BootstrapProvider>
      </DataCacheProvider>
    </SessionProvider>
  );
}
