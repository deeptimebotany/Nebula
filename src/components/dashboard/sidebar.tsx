"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/dashboard/toast";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { useCosmetics } from "@/components/cosmetics-provider";
import { SidebarShootingStars } from "@/components/cosmetics/sidebar-shooting-stars";
import { IconClose, IconLink, IconCard, IconSettings, IconMoon, IconSun, IconHeart, IconLogout, IconTrophy, IconFlask } from "./icons";
import { NebulaIcon } from "./nebula-brandmark";
// Import JSON direct (resolveJsonModule dans tsconfig.json) : juste pour
// afficher le numéro de version en pied de menu, jamais recopié à la main.
import packageJson from "../../../package.json";

// Durée totale de la rotation déclenchée par l'appui long sur le logo (voir
// startLogoSpin ci-dessous) et angle total parcouru sur cette durée.
const LOGO_SPIN_HOLD_MS = 3000;
const LOGO_SPIN_DURATION_MS = 3200;
const LOGO_SPIN_TOTAL_DEGREES = 2200;

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  items: SidebarNavItem[];
  brandName: string;
  logoUrl?: string | null;
  // true uniquement pour le compte propriétaire du site (voir layout.tsx) —
  // affiche un lien supplémentaire, privé, vers /dev-preview (voir ce
  // fichier). Absent/false pour tout le monde d'autre.
  isOwner?: boolean;
}

// Menu latéral déroulant, ouvert via l'icône "hamburger" à gauche du logo
// (voir topnav.tsx) — SEUL point d'accès à la navigation "compte" (Comptes,
// Facturation, Paramètres, apparence, soutien, déconnexion) : la barre du
// haut ne garde que les onglets de travail au quotidien (Calendrier,
// Importation, Analytics...), tout le reste vit ici pour lui laisser de la
// place. La liste défile (overflow-y-auto) si jamais elle dépasse la
// hauteur de l'écran (ex. petite fenêtre + beaucoup d'options futures).
export function Sidebar({ open, onClose, items, brandName, logoUrl, isOwner }: SidebarProps) {
  const pathname = usePathname();
  const { mode, setMode } = useMode();
  const toast = useToast();
  const cosmetics = useCosmetics();

  // Ferme au clavier (Échap) — confort standard pour ce genre de panneau.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Easter egg : appui long (3s) sur le logo → il se met à tourner de plus
  // en plus vite (accélération réelle, pas une vitesse constante) pendant
  // ~3s, puis se stabilise en douceur. holdTimer arme le déclenchement au
  // bout de LOGO_SPIN_HOLD_MS ; spinRaf anime ensuite l'angle avec un
  // exposant > 1 (t^2.2) pour que la vitesse angulaire grandisse vraiment
  // avec le temps plutôt que de tourner à vitesse fixe.
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

  // Easter egg "Navigation au clavier" : vrai si le bouton Déconnexion (voir
  // plus bas) a été focus via un clic souris plutôt que Tab — voir onFocus/
  // onMouseDown/onBlur sur ce bouton.
  const lastFocusWasMouse = useRef(false);

  // Easter egg : 5 clics sur le numéro de version, en pied de menu.
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

  // Easter egg : basculer Sombre/Clair 10 fois de suite (en moins de 3s
  // entre deux clics) déclenche un petit message taquin — le compteur se
  // remet à zéro dès qu'on marque une pause.
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

  return (
    <>
      {/* Fond assombri derrière le panneau : cliquer dessus referme le menu. */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={clsx(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        role="dialog"
        aria-label="Menu de navigation"
        aria-hidden={!open}
        className={clsx(
          "glass-panel-solid fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col rounded-r-2xl border-l-0 transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {cosmetics.has("sidebar-poussiere-etoiles") && <SidebarShootingStars />}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              // Logo officiel Nebula (voir topnav.tsx) — même icône animée
              // que dans la barre du haut, pour que la bulle du menu latéral
              // ne montre plus l'ancien logo statique (étincelle seule).
              // onPointer* : easter egg d'appui long, voir startLogoSpin.
              <div
                onPointerDown={onLogoPressStart}
                onPointerUp={onLogoPressEnd}
                onPointerLeave={onLogoPressEnd}
                onPointerCancel={onLogoPressEnd}
                className="cursor-pointer select-none"
                style={{
                  transform: logoSpinAngle ? `rotate(${logoSpinAngle}deg)` : undefined,
                  transition: logoSpinning ? undefined : "transform 0.4s ease-out"
                }}
              >
                <NebulaIcon size={32} />
              </div>
            )}
            <span className="font-display text-base font-semibold text-white">{brandName}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Liste défilante des destinations — overflow-y-auto fait tout le
            travail si le nombre d'options dépasse la hauteur disponible. */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-nebula-700/60 to-nebula-600/20 text-white shadow-glow"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className={clsx("h-[18px] w-[18px]", active ? "text-aurora-300" : "text-slate-500")} />
                {item.label}
              </Link>
            );
          })}

          {/* Comptes connectés, Facturation, Paramètres — regroupés à part
              des onglets de travail ci-dessus (juste une séparation visuelle,
              sans étiquette). */}
          <div className="mt-3 border-t border-white/[0.06] pt-3" />
          {[
            { href: "/accounts", label: "Comptes", icon: IconLink },
            { href: "/billing", label: "Facturation", icon: IconCard },
            { href: "/settings", label: "Paramètres", icon: IconSettings },
            // Volontairement discret ici plutôt que dans une barre de
            // navigation principale — voir succes/page.tsx.
            { href: "/succes", label: "Succès", icon: IconTrophy },
            // Onglet privé, réservé au compte propriétaire (voir isOwner
            // ci-dessus et dev-preview/page.tsx) : n'apparaît dans ce tableau
            // que pour ce compte-là, jamais pour les autres utilisateurs.
            ...(isOwner ? [{ href: "/dev-preview", label: "Test / QA", icon: IconFlask }] : [])
          ].map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-nebula-700/60 to-nebula-600/20 text-white shadow-glow"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className={clsx("h-[18px] w-[18px]", active ? "text-aurora-300" : "text-slate-500")} />
                {item.label}
              </Link>
            );
          })}

          {/* Apparence : bascule Sombre/Clair (voir mode-provider.tsx),
              appliquée par-dessus n'importe lequel des thèmes de couleurs
              choisis dans Paramètres. */}
          <p className="px-3 pb-1 pt-4 text-[11px] uppercase tracking-wide text-slate-500">Apparence</p>
          <div className="grid grid-cols-2 gap-2 px-3">
            <button
              onClick={() => handleModeClick("dark")}
              className={clsx(
                "flex flex-col items-center gap-1.5 rounded-lg border-2 py-2.5 text-xs transition",
                mode === "dark" ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25"
              )}
            >
              <IconMoon className="h-4 w-4" />
              Sombre
            </button>
            <button
              onClick={() => handleModeClick("light")}
              className={clsx(
                "flex flex-col items-center gap-1.5 rounded-lg border-2 py-2.5 text-xs transition",
                mode === "light" ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25"
              )}
            >
              <IconSun className="h-4 w-4" />
              Clair
            </button>
          </div>

          {/* Soutien et déconnexion — tout ce qui restait dispersé ailleurs
              (bulle de profil, barre du haut) vit maintenant ici. */}
          <div className="mt-4 space-y-1 border-t border-white/[0.06] px-3 pt-3">
            <Link
              href="/support"
              onClick={onClose}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                pathname === "/support" ? "text-accent-magenta" : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <IconHeart className="h-[18px] w-[18px]" /> Soutenir Nebula
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              onFocus={() => {
                // Easter egg "Navigation au clavier" : ce bouton est le
                // DERNIER élément focusable du menu — l'atteindre au clavier
                // (Tab) prouve qu'on a parcouru tout le menu sans souris. Ne
                // se déclenche PAS sur un simple clic (voir onMouseDown, qui
                // pose un flag consulté juste après par onFocus).
                if (!lastFocusWasMouse.current) reportEasterEggFound("keyboard-nav");
              }}
              onMouseDown={() => {
                lastFocusWasMouse.current = true;
              }}
              onBlur={() => {
                lastFocusWasMouse.current = false;
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <IconLogout className="h-[18px] w-[18px]" /> Déconnexion
            </button>
          </div>

          {/* Numéro de version — discret, mais bien réel (voir package.json)
              plutôt qu'un chiffre inventé. Easter egg : 5 clics d'affilée. */}
          <button
            onClick={onVersionClick}
            className={clsx(
              "mt-2 w-full px-3 pb-1 text-left text-[11px] text-slate-600 transition",
              versionPulse && "text-aurora-300"
            )}
          >
            v{packageJson.version}
          </button>
        </nav>
      </aside>
    </>
  );
}
