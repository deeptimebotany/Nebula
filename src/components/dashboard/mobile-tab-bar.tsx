"use client";

// Barre d'onglets du bas, téléphone uniquement (Lot 3) : les quatre pages du
// quotidien + « Menu » qui ouvre le tiroir complet. Avant : la barre du haut
// réduisait les onglets à des icônes sans libellé sur petit écran.
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-void-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
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
              aria-current={active ? "page" : undefined}
              className={clsx("flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition", active ? "text-white" : "text-slate-500 hover:text-slate-300")}
            >
              <span
                className={clsx(
                  "flex h-7 w-11 items-center justify-center rounded-full transition",
                  primary ? "bg-gradient-to-r from-nebula-500 to-accent-cyan text-white shadow-glow" : active && "bg-white/[0.08]"
                )}
              >
                <Icon className={clsx("h-[18px] w-[18px]", primary ? "text-white" : active ? "text-aurora-300" : "")} />
              </span>
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Ouvrir le menu complet"
          aria-expanded={menuOpen}
          className={clsx("flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition", menuOpen ? "text-white" : "text-slate-500 hover:text-slate-300")}
        >
          <span className={clsx("flex h-7 w-11 items-center justify-center rounded-full", menuOpen && "bg-white/[0.08]")}>
            <IconMenu className="h-[18px] w-[18px]" />
          </span>
          Menu
        </button>
      </div>
    </nav>
  );
}
