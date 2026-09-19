"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { BackgroundProvider } from "@/components/background-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <BackgroundProvider>{children}</BackgroundProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
