"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundProvider } from "@/components/background-provider";
import { ModeProvider } from "@/components/mode-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <BackgroundProvider>
          <ModeProvider>{children}</ModeProvider>
        </BackgroundProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
