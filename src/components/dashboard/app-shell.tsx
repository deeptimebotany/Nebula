"use client";

// Shell de l'application connectée (Lot 3) : barre latérale fixe sur
// ordinateur (repliable en icônes), tiroir + barre d'onglets du bas sur
// téléphone, en-tête d'une seule ligne. Remplace l'ancienne barre du haut à
// deux lignes (topnav.tsx) et son menu latéral déroulant (sidebar.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { useBootstrap } from "@/components/bootstrap-provider";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { SidebarNav } from "./sidebar-nav";
import { AppHeader } from "./app-header";
import { MobileTabBar } from "./mobile-tab-bar";

const COLLAPSED_KEY = "nebula:sidebar-collapsed";

interface AppShellProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  isOwner?: boolean;
  children: React.ReactNode;
}

export function AppShell({ oauth, isOwner, children }: AppShellProps) {
  const pathname = usePathname();
  const { data } = useBootstrap();
  const whiteLabel = data?.whiteLabel ?? { brandName: null, logoUrl: null };
  const brandName = whiteLabel.brandName || "Nebula";

  // Tiroir (téléphone)
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Colonne repliée (ordinateur), mémorisée sur cet appareil
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // stockage indisponible — colonne dépliée
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Fermer le tiroir à chaque navigation et sur Échap.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  // Easter egg « sidebar-menu-mash-unlock » (voir easter-eggs-registry.ts) :
  // ouvrir le menu (☰ sur téléphone, ou déplier/replier la colonne sur
  // ordinateur) 7 fois de suite en moins de 10 secondes.
  const menuClicks = useRef(0);
  const menuClicksResetTimer = useRef<number | null>(null);
  function countMenuOpen() {
    menuClicks.current += 1;
    if (menuClicksResetTimer.current) window.clearTimeout(menuClicksResetTimer.current);
    if (menuClicks.current >= 7) {
      menuClicks.current = 0;
      reportEasterEggFound("sidebar-menu-mash-unlock");
    } else {
      menuClicksResetTimer.current = window.setTimeout(() => {
        menuClicks.current = 0;
      }, 10000);
    }
  }
  function openDrawer() {
    countMenuOpen();
    setDrawerOpen(true);
  }
  function onToggleCollapsed() {
    countMenuOpen();
    toggleCollapsed();
  }

  return (
    <div className="flex min-h-screen">
      {/* Colonne fixe — ordinateur */}
      <aside
        className={clsx(
          "glass-panel-solid fixed inset-y-0 left-0 z-40 hidden flex-col border-y-0 border-l-0 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        <SidebarNav collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} isOwner={isOwner} brandName={brandName} logoUrl={whiteLabel.logoUrl} />
      </aside>

      {/* Tiroir — téléphone / tablette */}
      <div
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
        className={clsx(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        aria-hidden={!drawerOpen}
        className={clsx(
          "glass-panel-solid fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col rounded-r-2xl border-l-0 transition-transform duration-200 ease-out lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Contenu monté seulement quand ouvert : pas de doublon focusable
            (deux menus identiques) pour le clavier et les lecteurs d'écran. */}
        {drawerOpen && <SidebarNav onClose={() => setDrawerOpen(false)} isOwner={isOwner} brandName={brandName} logoUrl={whiteLabel.logoUrl} />}
      </aside>

      {/* Colonne de contenu */}
      <div className={clsx("flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <AppHeader oauth={oauth} onOpenMenu={openDrawer} menuOpen={drawerOpen} whiteLabel={whiteLabel} />
        <main id="contenu" tabIndex={-1} className="noise-grid flex-1 px-4 pb-24 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
        <MobileTabBar onOpenMenu={openDrawer} menuOpen={drawerOpen} />
      </div>
    </div>
  );
}
