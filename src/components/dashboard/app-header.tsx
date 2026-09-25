"use client";

// En-tête d'une seule ligne (Lot 3) — avant : deux lignes de 56 px chacune,
// qui répétaient les onglets du menu latéral. Ici ne restent que ce qui
// n'est PAS de la navigation : ouvrir le menu (téléphone), rechercher /
// palette de commandes, les comptes connectés de la marque active, la mise à
// niveau et le sélecteur de compte.
import { useAvailableNetworks } from "@/lib/use-available-networks";
import Link from "next/link";
import { RemoteImage } from "@/components/ui/remote-image";
import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useBootstrap } from "@/components/bootstrap-provider";
import { PROVIDERS } from "@/lib/providers";
import type { Network } from "@/lib/types";
import { NebulaBrandMark } from "./nebula-brandmark";
import { AccountSwitcher } from "./account-switcher";
import { NotificationBell } from "./notification-bell";
import { UpgradeButton } from "./upgrade-gem";
import { openCommandPalette } from "./command-palette";
import { useAiAssistant } from "./ai-assistant-context";
import { IconMenu, IconPlus, IconSearch, IconSparkle } from "./icons";
import { useConnections } from "@/lib/data/hooks";

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
  status: string;
}

interface AppHeaderProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
  onOpenMenu: () => void;
  menuOpen: boolean;
  whiteLabel: { brandName: string | null; logoUrl: string | null };
}

export function AppHeader({ oauth, onOpenMenu, menuOpen, whiteLabel }: AppHeaderProps) {
  const offeredNetworks = useAvailableNetworks();
  const { activeBrand } = useBrand();
  const { data } = useBootstrap();
  const assistant = useAiAssistant();

  // Comptes de la marque active : cache partagé avec les pages (lot 6).
  const connections = useConnections<ConnectionRow>(activeBrand?.id).connections ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);


  // Le menu « Connecter un compte » s'ouvre à DROITE du bouton + (aligné sur
  // son bord gauche) : ancré à droite, il partait sous la colonne de
  // navigation dès que la marque avait peu de comptes. Il ne bascule à
  // droite que s'il manque de place côté droit de la fenêtre.
  const [addAlign, setAddAlign] = useState<"left" | "right">("left");
  useEffect(() => {
    if (!addOpen) return;
    const rect = addRef.current?.getBoundingClientRect();
    setAddAlign(rect && rect.left + 248 > window.innerWidth ? "right" : "left");
    function onClickOutside(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [addOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void-950/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-6">
        {/* Téléphone : menu + logo */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
        >
          <IconMenu className="h-[18px] w-[18px]" />
        </button>
        <Link href="/dashboard" className="mr-1 flex shrink-0 items-center gap-2 lg:hidden" aria-label="Vue d'ensemble">
          {whiteLabel.logoUrl ? (
            <>
              <RemoteImage src={whiteLabel.logoUrl} className="h-7 w-7 rounded-lg" sizes="28px" />
              <span className="font-display text-base font-semibold text-white">{whiteLabel.brandName || "Nebula"}</span>
            </>
          ) : (
            <NebulaBrandMark iconSize={26} wordHeight={24} />
          )}
        </Link>

        {/* Comptes connectés de la marque active (ordinateur) */}
        {activeBrand && (
          <div className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex">
            <span className="mr-1 hidden shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-500 xl:inline [.nebula-assistant-docked_&]:hidden">{activeBrand.name}</span>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-1" aria-label="Comptes connectés">
              {connections.map((c) => (
                <span
                  key={c.id}
                  title={`${c.displayName} (${c.network})${c.status === "CONNECTED" ? "" : " — à reconnecter"}`}
                  className={clsx(
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
                    c.status === "CONNECTED" ? "border-white/10 bg-white/[0.03] text-slate-300" : "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.status === "CONNECTED" ? "#34d399" : "#f59e0b" }} aria-hidden="true" />
                  <span className="max-w-[90px] truncate">{c.displayName}</span>
                </span>
              ))}
              {connections.length === 0 && <span className="text-xs text-slate-500">Aucun compte connecté</span>}
            </div>
            <div className="relative shrink-0" ref={addRef}>
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                aria-label="Connecter un compte"
                aria-haspopup="menu"
                aria-expanded={addOpen}
                title="Connecter un compte"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-aurora-400/40 hover:text-white"
              >
                <IconPlus className="h-3.5 w-3.5" />
              </button>
              {addOpen && (
                <div role="menu" className={clsx("glass-panel-solid absolute top-[calc(100%+6px)] z-50 w-60 rounded-xl p-1.5", addAlign === "left" ? "left-0" : "right-0")}>
                  <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-slate-500">Connecter</p>
                  {PROVIDERS.filter((p) => p.networks.some((n) => offeredNetworks.includes(n))).map((p) => (
                    <a key={p.id} href={`/api/connections/${p.id}/start?brandId=${activeBrand.id}`} className="flex items-center rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                      {p.label}
                    </a>
                  ))}
                  <Link href="/accounts" onClick={() => setAddOpen(false)} className="mt-1 block border-t border-white/[0.06] px-3 pt-2 text-xs text-aurora-300 hover:underline">
                    Gérer tous mes comptes →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 md:hidden" />

        {/* Recherche / palette */}
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Rechercher ou aller à une page"
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-slate-400 transition hover:border-white/20 hover:text-white sm:px-3"
        >
          <IconSearch className="h-4 w-4" />
          <span className="hidden text-xs sm:inline [.nebula-assistant-docked_&]:hidden">Rechercher</span>
          <kbd className="hidden rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-sans text-[10px] text-slate-500 lg:inline [.nebula-assistant-docked_&]:hidden">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>

        {/* Assistant IA — même point d'entrée que le bouton flottant, à
            l'endroit où YouTube Studio place « Demander à Studio ». Masqué
            tant que l'IA n'est pas disponible pour la marque. */}
        {assistant.enabled && (
          <button
            type="button"
            onClick={assistant.toggle}
            aria-label="Demander à Nebula"
            aria-pressed={assistant.open}
            title="Demander à Nebula"
            className={clsx(
              "flex h-9 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-xs transition sm:px-3",
              assistant.open
                ? "border-aurora-400/50 bg-nebula-700/40 text-white"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-aurora-400/40 hover:text-white"
            )}
          >
            <IconSparkle className="h-4 w-4 text-aurora-300" />
            <span className="hidden md:inline [.nebula-assistant-docked_&]:hidden">Demander à Nebula</span>
          </button>
        )}

        {/* Centre de notifications (voir notification-bell.tsx). */}
        <NotificationBell />

        {/* Assistant ancré à droite (ordinateur) : la barre perd ~420 px ;
            libellés et bouton de mise à niveau s'effacent pour que rien ne
            se chevauche (lot 5). */}
        {data && data.plan !== "AGENCY" && <UpgradeButton size="sm" className="hidden shrink-0 sm:inline-flex [.nebula-assistant-docked_&]:hidden" label="Mettre à niveau" />}

        <AccountSwitcher oauth={oauth} />
      </div>
    </header>
  );
}
