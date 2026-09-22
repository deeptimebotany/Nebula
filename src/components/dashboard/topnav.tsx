"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { PROVIDERS } from "@/lib/providers";
import type { Network } from "@/lib/types";
import type { Plan } from "@/lib/plans";
import { NebulaBrandMark } from "@/components/dashboard/nebula-brandmark";
import {
  IconHome,
  IconCalendar,
  IconUpload,
  IconChart,
  IconChevron,
  IconUsers,
  IconPlus,
  IconAvatar,
  IconMenu,
  IconRetention,
  IconReport,
  IconCalendarShare
} from "./icons";
import { UpgradeButton, UpgradeGem } from "./upgrade-gem";
import { Sidebar } from "./sidebar";
import { AccountSwitcher } from "./account-switcher";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { useCosmetics } from "@/components/cosmetics-provider";

// Onglets de travail au quotidien uniquement — Comptes, Facturation et
// Paramètres ne sont plus ici : ils vivent désormais uniquement dans le
// menu latéral (voir sidebar.tsx), avec l'apparence, le soutien et la
// déconnexion, pour laisser le plus de place possible à cette barre.
const NAV = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: IconHome },
  { href: "/calendar", label: "Calendrier", icon: IconCalendar },
  { href: "/composer", label: "Importation", icon: IconUpload },
  { href: "/analytics", label: "Analytics", icon: IconChart },
  { href: "/retention", label: "Rétention IA", icon: IconRetention },
  { href: "/reports", label: "Rapports", icon: IconReport },
  { href: "/calendar-share", label: "Calendrier client", icon: IconCalendarShare },
  { href: "/community", label: "Communauté", icon: IconUsers }
];

const PLAN_BADGE_STYLE: Record<Plan, string> = {
  FREE: "border-white/15 bg-white/[0.04] text-slate-400",
  PRO: "border-aurora-400/40 bg-aurora-400/10 text-aurora-300",
  AGENCY: "border-amber-400/40 bg-amber-400/10 text-amber-300"
};

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
  status: string;
}

interface TopNavProps {
  oauth?: { google: boolean; apple: boolean; facebook: boolean };
}

export function TopNav({ oauth }: TopNavProps) {
  const pathname = usePathname();
  const { brands, activeBrand, setActiveBrandId, createBrand } = useBrand();
  const toast = useToast();

  // Menu latéral déroulant (voir sidebar.tsx), ouvert via l'icône
  // "hamburger" à gauche du logo — indépendant de la barre d'onglets du
  // haut, qui reste inchangée.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [plan, setPlan] = useState<Plan>("FREE");
  const [maxBrands, setMaxBrands] = useState(1);
  const [brandsOwned, setBrandsOwned] = useState(0);

  const cosmetics = useCosmetics();
  const [brandSwitcherOpen, setBrandSwitcherOpen] = useState(false);
  // Easter egg : double-clic sur l'avatar/pastille de compte (façon "like"
  // Instagram) — purement décoratif, un petit cœur flotte puis disparaît.
  const [avatarHeart, setAvatarHeart] = useState(false);
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [creating, setCreating] = useState(false);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  // Marque blanche (palier Agence, voir Paramètres) : remplace le logo et le
  // nom "Nebula" quand renseignés.
  const [whiteLabel, setWhiteLabel] = useState<{ brandName: string | null; logoUrl: string | null }>({
    brandName: null,
    logoUrl: null
  });

  const brandSwitcherRef = useRef<HTMLDivElement>(null);
  const addAccountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/billing/plan")
      .then((r) => r.json())
      .then((d) => {
        setPlan(d.plan ?? "FREE");
        setMaxBrands(d.maxBrands ?? 1);
        setBrandsOwned(d.brandsOwned ?? 0);
      })
      .catch(() => undefined);
    fetch("/api/settings/white-label")
      .then((r) => r.json())
      .then((d) => setWhiteLabel({ brandName: d.brandName ?? null, logoUrl: d.logoUrl ?? null }))
      .catch(() => undefined);
  }, [brands.length]);

  useEffect(() => {
    if (!activeBrand) return;
    fetch(`/api/connections?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => setConnections(d.connections ?? []))
      .catch(() => undefined);
  }, [activeBrand]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (brandSwitcherRef.current && !brandSwitcherRef.current.contains(e.target as Node)) {
        setBrandSwitcherOpen(false);
        setAddingBrand(false);
      }
      if (addAccountRef.current && !addAccountRef.current.contains(e.target as Node)) {
        setAddAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const atBrandLimit = brandsOwned >= maxBrands;

  async function submitNewBrand() {
    if (!newBrandName.trim()) return;
    setCreating(true);
    const res = await createBrand(newBrandName.trim());
    setCreating(false);
    if (!res.ok) {
      toast.error(res.error ?? "Erreur lors de la création de la marque.");
      return;
    }
    toast.success(`Marque "${newBrandName.trim()}" créée.`);
    setNewBrandName("");
    setAddingBrand(false);
    setBrandSwitcherOpen(false);
  }

  return (
    // Sidebar en dehors du <header> : le header a "backdrop-blur"
    // (backdrop-filter), qui crée un nouveau "containing block" pour ses
    // descendants en position "fixed" — la sidebar se retrouverait alors
    // bornée à la hauteur du header (56px) au lieu de couvrir tout l'écran.
    // La sortir dans un fragment frère du header évite complètement le
    // problème.
    <>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={NAV}
        brandName={whiteLabel.brandName || "Nebula"}
        logoUrl={whiteLabel.logoUrl}
      />
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void-950/90 backdrop-blur">
      {/* Ligne 1 — hamburger, logo, onglets, actions de compte */}
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={sidebarOpen}
          className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <IconMenu className="h-[18px] w-[18px]" />
        </button>

        <Link href="/dashboard" className="mr-2 flex shrink-0 items-center gap-2">
          {whiteLabel.logoUrl ? (
            <>
              <img src={whiteLabel.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              <span className="hidden font-display text-lg font-semibold text-white sm:inline">
                {whiteLabel.brandName || "Nebula"}
              </span>
            </>
          ) : (
            // Logo officiel Nebula : SVG vivant (pas une image statique), animé
            // en boucle perpétuelle, dont les couleurs suivent automatiquement
            // le thème actif — voir nebula-brandmark.tsx.
            <NebulaBrandMark />
          )}
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-r from-nebula-700/60 to-nebula-600/20 text-white shadow-glow"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className={clsx("h-4 w-4", active ? "text-aurora-300" : "text-slate-500")} />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Vrai compte connecté (Google/Apple/Meta/email) — distinct de la
            marque active, voir ligne 2 ci-dessous. Permet de basculer entre
            plusieurs comptes déjà connectés sur cet appareil, ou d'en
            ajouter un (voir account-switcher.tsx). */}
        <AccountSwitcher oauth={oauth} />
      </div>

      {/* Ligne 2 — marque active, comptes connectés, mise à niveau */}
      <div className="flex h-14 items-center gap-3 border-t border-white/[0.04] px-4 sm:px-6">
        <div className="relative shrink-0" ref={brandSwitcherRef}>
          <button
            onClick={() => setBrandSwitcherOpen((v) => !v)}
            onDoubleClick={() => {
              setAvatarHeart(true);
              reportEasterEggFound("avatar-double-tap");
              window.setTimeout(() => setAvatarHeart(false), 700);
            }}
            title="Changer de marque ou gérer votre compte"
            className="glass-panel flex items-center gap-2 rounded-xl px-3 py-1.5 text-left"
          >
            {avatarHeart && (
              <span
                className="pointer-events-none absolute -top-3 left-3 text-lg"
                style={{ animation: "nebula-avatar-heart 0.7s ease-out forwards" }}
              >
                ❤️
              </span>
            )}
            <span
              className={clsx(
                "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                cosmetics.has("anneau-saturne-avatar") && "nebula-cosmetic-saturn-ring",
                !cosmetics.has("anneau-saturne-avatar") && cosmetics.has("halo-dore-avatar") && "nebula-cosmetic-gold-halo"
              )}
            >
              <IconAvatar className="h-4 w-4 shrink-0 text-slate-400" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="max-w-[140px] truncate text-sm font-medium text-white">
                  {activeBrand?.name ?? "Sélectionner une marque"}
                </p>
                <span className={clsx("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", PLAN_BADGE_STYLE[plan])}>
                  {plan === "FREE" ? "Gratuit" : plan === "PRO" ? "Pro" : "Agence"}
                </span>
              </div>
            </div>
            <IconChevron className={clsx("h-3.5 w-3.5 shrink-0 text-slate-400 transition", brandSwitcherOpen && "rotate-180")} />
          </button>

          {brandSwitcherOpen && (
            <div className="glass-panel-solid absolute left-0 top-[calc(100%+6px)] z-20 w-72 rounded-xl p-1.5">
              <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-slate-500">
                Vos marques · {brandsOwned}/{maxBrands}
              </p>
              {brands.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setActiveBrandId(b.id);
                    setBrandSwitcherOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
                    b.id === activeBrand?.id ? "bg-nebula-600/30 text-white" : "text-slate-300 hover:bg-white/5"
                  )}
                >
                  <span className="truncate">{b.name}</span>
                  <span className="text-[11px] uppercase text-slate-500">{b.role}</span>
                </button>
              ))}
              {brands.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Aucune marque encore.</p>}

              <div className="mt-1 border-t border-white/[0.06] pt-1.5">
                {atBrandLimit ? (
                  <Link
                    href="/billing"
                    className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
                  >
                    <UpgradeGem className="h-4 w-4 opacity-70" />
                    Limite de marques atteinte — passer à un palier supérieur
                  </Link>
                ) : addingBrand ? (
                  <div className="space-y-2 p-1.5">
                    <input
                      autoFocus
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitNewBrand()}
                      placeholder="Nom de la nouvelle marque"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-aurora-400/60"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setAddingBrand(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                        Annuler
                      </button>
                      <button
                        onClick={submitNewBrand}
                        disabled={creating || !newBrandName.trim()}
                        className="rounded-lg bg-gradient-to-r from-nebula-500 to-accent-cyan px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {creating ? "Création..." : "Créer"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingBrand(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
                  >
                    <IconPlus className="h-4 w-4" /> Ajouter une marque
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Comptes connectés de la marque active : défilement horizontal +
            raccourci "+" pour en ajouter un sans quitter la page. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
            {connections.map((c) => (
              <span
                key={c.id}
                title={`${c.displayName} (${c.network})`}
                className={clsx(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
                  c.status === "CONNECTED" ? "border-white/10 bg-white/[0.03] text-slate-300" : "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: c.status === "CONNECTED" ? "#34d399" : "#f59e0b" }}
                />
                <span className="max-w-[90px] truncate">{c.displayName}</span>
              </span>
            ))}
            {connections.length === 0 && activeBrand && (
              <span className="text-xs text-slate-500">Aucun compte connecté</span>
            )}
          </div>

          <div className="relative shrink-0" ref={addAccountRef}>
            <button
              onClick={() => setAddAccountOpen((v) => !v)}
              disabled={!activeBrand}
              title="Ajouter un compte"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-aurora-400/40 hover:text-white disabled:opacity-40"
            >
              <IconPlus className="h-3.5 w-3.5" />
            </button>
            {addAccountOpen && activeBrand && (
              <div className="glass-panel-solid absolute right-0 top-[calc(100%+6px)] z-20 w-64 rounded-xl p-1.5">
                <p className="px-2 pb-1 pt-1 text-[11px] uppercase tracking-wide text-slate-500">Connecter</p>
                {PROVIDERS.map((p) => (
                  <a
                    key={p.id}
                    href={`/api/connections/${p.id}/start?brandId=${activeBrand.id}`}
                    className="flex items-center rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    {p.label}
                  </a>
                ))}
                <Link
                  href="/accounts"
                  onClick={() => setAddAccountOpen(false)}
                  className="mt-1 block border-t border-white/[0.06] px-3 pt-2 text-xs text-aurora-300 hover:underline"
                >
                  Gérer tous mes comptes →
                </Link>
              </div>
            )}
          </div>
        </div>

        {plan !== "AGENCY" && <UpgradeButton size="sm" className="shrink-0" />}
      </div>
      </header>
      <style jsx>{`
        @keyframes nebula-avatar-heart {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          30% {
            opacity: 1;
            transform: translateY(-6px) scale(1.15);
          }
          100% {
            transform: translateY(-22px) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
