"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundProvider } from "@/components/background-provider";
import { ModeProvider } from "@/components/mode-provider";
import { StarfieldProvider } from "@/components/starfield-provider";
import { CosmeticsProvider } from "@/components/cosmetics-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <BackgroundProvider>
          <StarfieldProvider>
            <CosmeticsProvider>
              <ModeProvider>{children}</ModeProvider>
            </CosmeticsProvider>
          </StarfieldProvider>
        </BackgroundProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
