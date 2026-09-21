"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { clsx } from "@/lib/clsx";
import { IconClose } from "./icons";
import { NebulaIcon } from "./nebula-brandmark";

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
// (voir topnav.tsx). Reprend les mêmes destinations que la barre d'onglets
// du haut, mais en liste verticale — pratique quand la barre du haut est
// trop chargée ou que l'utilisateur préfère une navigation façon
// "app mobile". La liste défile (overflow-y-auto) si jamais elle dépasse
// la hauteur de l'écran (ex. petite fenêtre + beaucoup d'options futures).
export function Sidebar({ open, onClose, items, brandName, logoUrl }: SidebarProps) {
  const pathname = usePathname();

  // Ferme au clavier (Échap) — confort standard pour ce genre de panneau.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
              <NebulaIcon size={32} />
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
        </nav>
      </aside>
    </>
  );
}
