"use client";

// Shell de l'application connectée (Lot 3) : barre latérale fixe sur
// ordinateur (repliable en icônes), tiroir + barre d'onglets du bas sur
// téléphone, en-tête d'une seule ligne. Remplace l'ancienne barre du haut à
// deux lignes (topnav.tsx) et son menu latéral déroulant (sidebar.tsx).
//
// Refonte V2 (07/10/2026, maquettes de Lucas) : fond uni partout (page,
// barre latérale et barre du haut de la même couleur, séparées par un trait
// fin), barre latérale en accordéons, réduite en icônes par défaut sur les
// écrans de moins de 1 360 px (tant qu'on n'a rien choisi), menu du profil
// en haut à droite. Le contenu porte la classe .nb-main : les blocs y
// perdent cadre et ombre (voir globals.css, « Refonte V2 »).
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { useBootstrap } from "@/components/bootstrap-provider";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { SidebarNav } from "./sidebar-nav";
import { AppHeader } from "./app-header";
import { MobileTabBar } from "./mobile-tab-bar";
import { InShellContext } from "./shell-context";
import { TrialBanner } from "@/components/billing/trial-banner";
import dynamic from "next/dynamic";
import { useBrand } from "@/components/brand-context";
import { TOUR_RESTART_EVENT } from "@/lib/tour-events";

// Chargés seulement quand ils servent (poids de toutes les pages, lot 4) :
// la visite guidée (nouveaux comptes, « Revoir la visite ») et le bandeau
// d'une marque en veille (lot E4).
const GuidedTour = dynamic(() => import("@/components/tour/guided-tour").then((m) => m.GuidedTour), { ssr: false });
// Confirmation de l'âge : chargée seulement pour les comptes qui ne l'ont pas encore faite.
const AgeGate = dynamic(() => import("@/components/age-gate").then((m) => m.AgeGate), { ssr: false });
const DormantBrandBanner = dynamic(() => import("@/components/billing/dormant-brand").then((m) => m.DormantBrandBanner), { ssr: false });
import { getPref, setPref } from "@/lib/ui-prefs-client";

const COLLAPSED_KEY = "nebula:sidebar-collapsed";

interface AppShellProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  isOwner?: boolean;
  children: React.ReactNode;
}

export function AppShell({ oauth, isOwner, children }: AppShellProps) {
  const pathname = usePathname();
  const { data } = useBootstrap();
  const { activeBrand } = useBrand();
  // « Revoir la visite » (Paramètres, palette) : charge la visite si besoin.
  const [tourReplay, setTourReplay] = useState(0);
  useEffect(() => {
    const onRestart = () => setTourReplay((n) => n + 1);
    window.addEventListener(TOUR_RESTART_EVENT, onRestart);
    return () => window.removeEventListener(TOUR_RESTART_EVENT, onRestart);
  }, []);
  const whiteLabel = data?.whiteLabel ?? { brandName: null, logoUrl: null };
  const brandName = whiteLabel.brandName || "Nebula";

  // Tiroir (téléphone)
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Assistant IA (09/10/2026) : fenêtre flottante posée par-dessus la page
  // (voir ai-assistant.tsx) — la colonne de contenu ne se rétrécit plus.
  const columnRef = useRef<HTMLDivElement>(null);
  // Colonne repliée (ordinateur), mémorisée sur cet appareil
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = getPref(COLLAPSED_KEY);
      // Rien de choisi : réduite (icônes) sur les écrans de moins de 1 360 px.
      setCollapsed(saved === "1" || (saved !== "0" && window.innerWidth < 1360));
    } catch {
      // stockage indisponible — colonne dépliée
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        setPref(COLLAPSED_KEY, next ? "1" : "0");
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
          "nb-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[color:var(--nb-sep)] transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-60"
        )}
      >
        <SidebarNav collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} brandName={brandName} logoUrl={whiteLabel.logoUrl} />
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
          "nb-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[color:var(--nb-sep)] shadow-2xl transition-transform duration-200 ease-out lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Contenu monté seulement quand ouvert : pas de doublon focusable
            (deux menus identiques) pour le clavier et les lecteurs d'écran. */}
        {drawerOpen && <SidebarNav onClose={() => setDrawerOpen(false)} brandName={brandName} logoUrl={whiteLabel.logoUrl} />}
      </aside>

      {/* Colonne de contenu */}
      <div
        ref={columnRef}
        className={clsx("flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-60")}
      >
        <AppHeader oauth={oauth} isOwner={isOwner} />
        <TrialBanner />
        {activeBrand?.dormant && <DormantBrandBanner />}
        <main id="contenu" tabIndex={-1} className="nb-main noise-grid flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <InShellContext.Provider value={true}>
            <div className="mx-auto max-w-7xl">{children}</div>
          </InShellContext.Provider>
        </main>
        <MobileTabBar onOpenMenu={openDrawer} menuOpen={drawerOpen} />
        {/* Âge (18 ans et plus) confirmé une fois, avant tout le reste ; puis
            la visite guidée à la première connexion (lot U4). */}
        {data && !data.ai.ageConfirmed ? <AgeGate /> : data && (!data.tour.completed || tourReplay > 0) && <GuidedTour replay={tourReplay} />}
      </div>
    </div>
  );
}
