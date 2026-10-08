"use client";

// Barre d'onglets du bas, téléphone uniquement (Lot 3) : les quatre pages du
// quotidien + « Menu » qui ouvre le tiroir complet. Avant : la barre du haut
// réduisait les onglets à des icônes sans libellé sur petit écran.
// Refonte V2 (07/10/2026) : barre unie, couleur de la page, trait fin ; seul
// « Publier » reste coloré (violet plein).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { ALL_NAV_ITEMS, MOBILE_TAB_HREFS, isNavActive } from "./navigation";
import { IconMenu } from "./icons";

export function MobileTabBar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const pathname = usePathname();
  const tabs = MOBILE_TAB_HREFS.map((href) => ALL_NAV_ITEMS.find((i) => i.href === href)!).filter(Boolean);

  return (
    <nav
      aria-label="Navigation rapide"
      className="nb-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--nb-sep)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="grid grid-cols-5">
        {tabs.map((item) => {
          const active = isNavActive(item.href, pathname);
          const Icon = item.icon;
          const primary = item.href === "/composer";
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={`nav-${item.href.slice(1)}`}
              aria-current={active ? "page" : undefined}
              className={clsx("flex flex-col items-center gap-1 py-2 text-[11px] transition", active ? "font-semibold text-white" : "font-medium text-slate-500 hover:text-white")}
            >
              <span
                className={clsx(
                  "flex h-7 w-11 items-center justify-center rounded-full transition",
                  primary ? "bg-aurora-500 text-white" : active && "bg-[color:var(--nb-active)]"
                )}
              >
                <Icon className={clsx("h-[18px] w-[18px]", primary ? "text-white" : active ? "text-white" : "")} />
              </span>
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          data-tour="mobile-menu"
          aria-label="Ouvrir le menu complet"
          aria-expanded={menuOpen}
          className={clsx("flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition", menuOpen ? "text-white" : "text-slate-500 hover:text-white")}
        >
          <span className={clsx("flex h-7 w-11 items-center justify-center rounded-full", menuOpen && "bg-[color:var(--nb-active)]")}>
            <IconMenu className="h-[18px] w-[18px]" />
          </span>
          Menu
        </button>
      </div>
    </nav>
  );
}
