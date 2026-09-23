"use client";

// Contenu de la barre latérale (Lot 3) : le même composant sert la colonne
// fixe sur ordinateur et le tiroir sur téléphone (voir app-shell.tsx). Il
// lit la navigation dans navigation.ts — l'unique source, partagée avec la
// barre d'onglets mobile et la palette Cmd/Ctrl+K.
import Link from "next/link";
import { RemoteImage } from "@/components/ui/remote-image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/dashboard/toast";
import { useCosmetics } from "@/components/cosmetics-provider";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { SidebarShootingStars } from "@/components/cosmetics/sidebar-shooting-stars";
import { NAV_GROUPS, OWNER_NAV_ITEM, isNavActive, type NavItem } from "./navigation";
import { BrandSwitcher } from "./brand-switcher";
import { NebulaIcon } from "./nebula-brandmark";
import { IconClose, IconLogout, IconMoon, IconSidebar, IconSun } from "./icons";
// Import JSON direct (resolveJsonModule dans tsconfig.json) : juste pour
// afficher le numéro de version en pied de menu, jamais recopié à la main.
import packageJson from "../../../package.json";

// Easter egg « logo-spin » : appui long sur le logo → rotation accélérée.
const LOGO_SPIN_HOLD_MS = 3000;
const LOGO_SPIN_DURATION_MS = 3200;
const LOGO_SPIN_TOTAL_DEGREES = 2200;

interface SidebarNavProps {
  /** Colonne repliée (icônes seules) — ordinateur uniquement. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Tiroir mobile : bouton de fermeture + fermeture après un clic. */
  onClose?: () => void;
  isOwner?: boolean;
  brandName: string;
  logoUrl?: string | null;
}

export function SidebarNav({ collapsed = false, onToggleCollapsed, onClose, isOwner, brandName, logoUrl }: SidebarNavProps) {
  const pathname = usePathname();
  const { mode, setMode } = useMode();
  const toast = useToast();
  const cosmetics = useCosmetics();

  // --- Easter egg : appui long (3 s) sur le logo ---------------------------
  const [logoSpinAngle, setLogoSpinAngle] = useState(0);
  const [logoSpinning, setLogoSpinning] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const spinRaf = useRef<number | null>(null);

  function startLogoSpin() {
    setLogoSpinning(true);
    reportEasterEggFound("logo-spin");
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / LOGO_SPIN_DURATION_MS, 1);
      setLogoSpinAngle(LOGO_SPIN_TOTAL_DEGREES * Math.pow(t, 2.2));
      if (t < 1) {
        spinRaf.current = requestAnimationFrame(tick);
      } else {
        setLogoSpinning(false);
        window.setTimeout(() => setLogoSpinAngle(0), 400);
      }
    }
    spinRaf.current = requestAnimationFrame(tick);
  }
  function onLogoPressStart() {
    if (holdTimer.current || logoSpinning) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      startLogoSpin();
    }, LOGO_SPIN_HOLD_MS);
  }
  function onLogoPressEnd() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }
  useEffect(
    () => () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      if (spinRaf.current) cancelAnimationFrame(spinRaf.current);
    },
    []
  );

  // --- Easter egg « keyboard-nav » : atteindre Déconnexion au clavier -----
  const lastFocusWasMouse = useRef(false);

  // --- Easter egg « version-click » : 5 clics sur le numéro de version ----
  const versionClicks = useRef(0);
  const versionClicksResetTimer = useRef<number | null>(null);
  const [versionPulse, setVersionPulse] = useState(false);
  function onVersionClick() {
    versionClicks.current += 1;
    if (versionClicksResetTimer.current) window.clearTimeout(versionClicksResetTimer.current);
    if (versionClicks.current >= 5) {
      versionClicks.current = 0;
      setVersionPulse(true);
      reportEasterEggFound("version-click");
      window.setTimeout(() => setVersionPulse(false), 1600);
    } else {
      versionClicksResetTimer.current = window.setTimeout(() => {
        versionClicks.current = 0;
      }, 4000);
    }
  }

  // --- Easter egg « theme-toggle-10x » ------------------------------------
  const modeToggleCount = useRef(0);
  const modeToggleResetTimer = useRef<number | null>(null);
  function handleModeClick(next: "dark" | "light") {
    setMode(next);
    modeToggleCount.current += 1;
    if (modeToggleResetTimer.current) window.clearTimeout(modeToggleResetTimer.current);
    if (modeToggleCount.current >= 10) {
      modeToggleCount.current = 0;
      toast.info("Vous hésitez ? Le mode sombre reste notre préféré 🌙");
      reportEasterEggFound("theme-toggle-10x");
    } else {
      modeToggleResetTimer.current = window.setTimeout(() => {
        modeToggleCount.current = 0;
      }, 3000);
    }
  }

  function renderItem(item: NavItem) {
    const active = isNavActive(item.href, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={clsx(
          "group flex items-center gap-3 rounded-xl text-sm font-medium transition",
          collapsed ? "justify-center px-0 py-2" : "px-3 py-1.5",
          active ? "bg-gradient-to-r from-nebula-700/60 to-nebula-600/20 text-white shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-white"
        )}
      >
        <Icon className={clsx("h-[18px] w-[18px] shrink-0", active ? "text-aurora-300" : "text-slate-500 group-hover:text-slate-300")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {cosmetics.has("sidebar-poussiere-etoiles") && <SidebarShootingStars />}

      {/* Logo + repli / fermeture */}
      <div className={clsx("flex h-14 shrink-0 items-center border-b border-white/[0.06]", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2" aria-label={`${brandName} — vue d'ensemble`}>
          {logoUrl ? (
            <RemoteImage src={logoUrl} className="h-8 w-8 shrink-0 rounded-lg" sizes="32px" />
          ) : (
            <span
              onPointerDown={onLogoPressStart}
              onPointerUp={onLogoPressEnd}
              onPointerLeave={onLogoPressEnd}
              onPointerCancel={onLogoPressEnd}
              className="inline-flex select-none"
              style={{
                transform: logoSpinAngle ? `rotate(${logoSpinAngle}deg)` : undefined,
                transition: logoSpinning ? undefined : "transform 0.4s ease-out"
              }}
            >
              <NebulaIcon size={30} />
            </span>
          )}
          {!collapsed && <span className="truncate font-display text-base font-semibold text-white">{brandName}</span>}
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        )}
        {onToggleCollapsed && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Replier le menu"
            title="Replier le menu"
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white lg:flex"
          >
            <IconSidebar className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Marque active */}
      <div className={clsx("shrink-0 border-b border-white/[0.06]", collapsed ? "p-2" : "p-3")}>
        <BrandSwitcher compact={collapsed} onNavigate={onClose} />
      </div>

      {/* Navigation */}
      <nav aria-label="Navigation principale" className={clsx("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        {NAV_GROUPS.map((group) => (
          <div key={group.key} className={clsx(group.label && "mt-3")}>
            {group.label && !collapsed && (
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{group.label}</p>
            )}
            {group.label && collapsed && <div className="mx-2 mb-2 border-t border-white/[0.06]" aria-hidden="true" />}
            <div className="space-y-0.5">
              {group.items.map(renderItem)}
              {group.key === "account" && isOwner && renderItem(OWNER_NAV_ITEM)}
            </div>
          </div>
        ))}
      </nav>

      {/* Pied : mode clair/sombre, déconnexion, version */}
      <div className={clsx("shrink-0 border-t border-white/[0.06] py-2", collapsed ? "px-2" : "px-3")}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => handleModeClick(mode === "dark" ? "light" : "dark")}
            aria-label={mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            title={mode === "dark" ? "Mode clair" : "Mode sombre"}
            className="flex w-full items-center justify-center rounded-xl py-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            {mode === "dark" ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-0.5" role="group" aria-label="Apparence">
            <button
              type="button"
              onClick={() => handleModeClick("dark")}
              aria-pressed={mode === "dark"}
              className={clsx("flex items-center justify-center gap-1.5 rounded-md py-1 text-xs transition", mode === "dark" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white")}
            >
              <IconMoon className="h-3.5 w-3.5" /> Sombre
            </button>
            <button
              type="button"
              onClick={() => handleModeClick("light")}
              aria-pressed={mode === "light"}
              className={clsx("flex items-center justify-center gap-1.5 rounded-md py-1 text-xs transition", mode === "light" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white")}
            >
              <IconSun className="h-3.5 w-3.5" /> Clair
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          onFocus={() => {
            // Easter egg « keyboard-nav » : dernier élément focusable du menu —
            // l'atteindre au clavier (Tab) prouve qu'on a parcouru tout le menu
            // sans souris. Ne se déclenche PAS sur un simple clic.
            if (!lastFocusWasMouse.current) reportEasterEggFound("keyboard-nav");
          }}
          onMouseDown={() => {
            lastFocusWasMouse.current = true;
          }}
          onBlur={() => {
            lastFocusWasMouse.current = false;
          }}
          title={collapsed ? "Déconnexion" : undefined}
          className={clsx(
            "mt-1 flex w-full items-center gap-3 rounded-xl text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white",
            collapsed ? "justify-center py-2" : "px-3 py-1.5 text-left"
          )}
        >
          <IconLogout className="h-[18px] w-[18px] shrink-0" /> {!collapsed && "Déconnexion"}
        </button>

        {!collapsed && (
          <button type="button" onClick={onVersionClick} className={clsx("w-full px-3 pt-1 text-left text-[11px] text-slate-500 transition", versionPulse && "text-aurora-300")}>
            v{packageJson.version}
          </button>
        )}
        {collapsed && onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Déplier le menu"
            title="Déplier le menu"
            className="mt-1 flex w-full items-center justify-center rounded-xl py-2 text-slate-500 transition hover:bg-white/5 hover:text-white"
          >
            <IconSidebar className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
