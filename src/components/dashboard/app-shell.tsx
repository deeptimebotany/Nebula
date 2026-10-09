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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { useBootstrap } from "@/components/bootstrap-provider";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { SidebarNav } from "./sidebar-nav";
import { AppHeader } from "./app-header";
import { MobileTabBar } from "./mobile-tab-bar";
import { InShellContext } from "./shell-context";
import { TrialBanner } from "@/components/billing/trial-banner";
import { ConnectionLimitGate } from "@/components/billing/connection-limit-gate";
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
import { useAiAssistant } from "./ai-assistant-context";
import { getPref, setPref } from "@/lib/ui-prefs-client";

// Tiroir « Demander à Nebula » sur ordinateur (voir ai-assistant.tsx et
// .nb-assistant-window dans globals.css) : 420 px de large, sous la barre du
// haut, détaché de 12 px des bords (coins arrondis). Le contenu SOUS la barre
// du haut se rétrécit d'autant quand il est ouvert, façon YouTube Studio, en
// gardant 12 px d'écart avec lui ; la barre du haut, elle, ne bouge pas
// (demande de Lucas, 09/10/2026).
const ASSISTANT_WIDTH = 420;
const ASSISTANT_GAP = 12;
const ASSISTANT_SPACE = ASSISTANT_WIDTH + 2 * ASSISTANT_GAP;

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

  // Assistant IA ouvert sur ordinateur : la zone SOUS la barre du haut
  // devient son propre conteneur de défilement, rétrécie de la largeur du
  // tiroir — sa barre de défilement se retrouve juste à GAUCHE du panneau
  // (modèle YouTube Studio) et la page ne défile plus derrière (plus de
  // double barre). La barre du haut reste sur toute la largeur, à la même
  // place : la place de la barre de défilement de la fenêtre est gardée
  // (classe nebula-assistant-gutter) pour que ses boutons ne glissent pas.
  // Le défilement est transféré dans les deux sens pour ne pas perdre la
  // position à l'ouverture et à la fermeture.
  const assistant = useAiAssistant();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [assistantDocked, setAssistantDocked] = useState(false);
  // Position de défilement à reporter une fois la mise en page changée.
  const pendingScroll = useRef<number | null>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function apply() {
      const dock = assistant.open && desktop.matches;
      if (dock === assistantDocked) return;
      const root = document.documentElement;
      if (dock) {
        pendingScroll.current = window.scrollY;
        // Barre de défilement de la fenêtre présente (Windows…) : sa place
        // reste réservée, sinon la barre du haut s'élargirait d'autant.
        root.classList.toggle("nebula-assistant-gutter", window.innerWidth > root.clientWidth);
      } else {
        pendingScroll.current = bodyRef.current?.scrollTop ?? 0;
      }
      setAssistantDocked(dock);
    }
    apply();
    desktop.addEventListener("change", apply);
    return () => desktop.removeEventListener("change", apply);
  }, [assistant.open, assistantDocked]);
  // Après le changement de mise en page (avant l'affichage) : classes de la
  // page et report du défilement, quand les nouvelles hauteurs existent.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("nebula-assistant-docked", assistantDocked);
    if (!assistantDocked) root.classList.remove("nebula-assistant-gutter");
    const y = pendingScroll.current;
    pendingScroll.current = null;
    if (y === null) return;
    if (assistantDocked) {
      if (bodyRef.current) bodyRef.current.scrollTop = y;
    } else {
      window.scrollTo(0, y);
    }
  }, [assistantDocked]);
  useEffect(() => () => document.documentElement.classList.remove("nebula-assistant-docked", "nebula-assistant-gutter"), []);
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
          // Sans trait à droite (09/10/2026, demande de Lucas : « épurer ») :
          // barre latérale et page ont le même fond uni.
          // Dès 768 px (09/10/2026, retour de Lucas : fenêtre coupée en deux,
          // plus de menu) : la colonne reste là, en icônes sous 1 360 px.
          "nb-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col transition-[width] duration-200 md:flex",
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
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 md:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        aria-hidden={!drawerOpen}
        className={clsx(
          "nb-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[color:var(--nb-sep)] shadow-2xl transition-transform duration-200 ease-out md:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Contenu monté seulement quand ouvert : pas de doublon focusable
            (deux menus identiques) pour le clavier et les lecteurs d'écran. */}
        {drawerOpen && <SidebarNav onClose={() => setDrawerOpen(false)} brandName={brandName} logoUrl={whiteLabel.logoUrl} />}
      </aside>

      {/* Colonne de contenu */}
      <div className={clsx("flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-200", collapsed ? "md:pl-[72px]" : "md:pl-60", assistantDocked && "lg:h-screen")}>
        <AppHeader oauth={oauth} isOwner={isOwner} onOpenMenu={openDrawer} />
        {/* Tout ce qui est sous la barre du haut : c'est cette zone (et elle
            seule) qui se rétrécit et défile quand l'assistant est ouvert. */}
        <div
          ref={bodyRef}
          className={clsx("flex min-w-0 flex-1 flex-col transition-[margin] duration-200", assistantDocked && "lg:min-h-0 lg:overflow-y-auto")}
          style={assistantDocked ? { marginRight: ASSISTANT_SPACE } : undefined}
        >
          <TrialBanner />
          {activeBrand?.dormant && <DormantBrandBanner />}
          <main id="contenu" tabIndex={-1} className="nb-main noise-grid flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 md:pb-12 lg:px-10 lg:pt-8">
            <InShellContext.Provider value={true}>
              <div className="mx-auto max-w-7xl">{children}</div>
            </InShellContext.Provider>
          </main>
        </div>
        <MobileTabBar onOpenMenu={openDrawer} menuOpen={drawerOpen} />
        {/* Plus de comptes connectés que le palier n'en permet (fin d'essai,
            résiliation) : application bloquée jusqu'à la déconnexion des
            comptes en trop (09/10/2026, voir connection-limit-gate.tsx). */}
        <ConnectionLimitGate />
        {/* Âge (18 ans et plus) confirmé une fois, avant tout le reste ; puis
            la visite guidée à la première connexion (lot U4). */}
        {data && !data.ai.ageConfirmed ? <AgeGate /> : data && (!data.tour.completed || tourReplay > 0) && <GuidedTour replay={tourReplay} />}
      </div>
    </div>
  );
}
