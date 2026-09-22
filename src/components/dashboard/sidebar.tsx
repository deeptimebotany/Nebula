"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/dashboard/toast";
import { IconClose, IconLink, IconCard, IconSettings, IconMoon, IconSun, IconHeart, IconLogout } from "./icons";
import { NebulaIcon } from "./nebula-brandmark";

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
}

// Menu latéral déroulant, ouvert via l'icône "hamburger" à gauche du logo
// (voir topnav.tsx) — SEUL point d'accès à la navigation "compte" (Comptes,
// Facturation, Paramètres, apparence, soutien, déconnexion) : la barre du
// haut ne garde que les onglets de travail au quotidien (Calendrier,
// Importation, Analytics...), tout le reste vit ici pour lui laisser de la
// place. La liste défile (overflow-y-auto) si jamais elle dépasse la
// hauteur de l'écran (ex. petite fenêtre + beaucoup d'options futures).
export function Sidebar({ open, onClose, items, brandName, logoUrl }: SidebarProps) {
  const pathname = usePathname();
  const { mode, setMode } = useMode();
  const toast = useToast();

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
            { href: "/settings", label: "Paramètres", icon: IconSettings }
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
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              <IconLogout className="h-[18px] w-[18px]" /> Déconnexion
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
}
