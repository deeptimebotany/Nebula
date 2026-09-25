"use client";

// Garde de la CSP stricte (lot 11). La politique de sécurité d'un onglet est
// fixée au chargement COMPLET de la page : si on part d'une page de la
// vitrine (CSP sans nonce) et qu'on suit un lien interne vers l'application
// ou une page à contenu d'utilisateurs, Next.js change de page sans
// recharger — l'onglet garderait la CSP de la vitrine. Dans ce cas, la page
// est rechargée une fois, pour recevoir la CSP stricte (voir src/lib/csp.ts).
//
// Les parcours courants ne passent pas par là : la connexion et
// l'inscription ouvrent le tableau de bord par un chargement complet.
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { needsStrictDocument, usesStrictCsp } from "@/lib/csp";

/** Adresse du chargement complet de l'onglet (après redirections), ou null. */
function documentPath(): string | null {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry ? new URL(entry.name).pathname : null;
  } catch {
    return null;
  }
}

export function CspDocumentGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || !needsStrictDocument(pathname)) return;
    const loadedFrom = documentPath();
    if (loadedFrom !== null && !usesStrictCsp(loadedFrom)) window.location.reload();
  }, [pathname]);
  return null;
}
