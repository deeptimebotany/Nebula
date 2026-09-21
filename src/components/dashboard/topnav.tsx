"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useBrand } from "@/components/brand-context";
import { useToast } from "@/components/dashboard/toast";
import { useMode } from "@/components/mode-provider";
import { PROVIDERS } from "@/lib/providers";
import type { Network } from "@/lib/types";
import type { Plan } from "@/lib/plans";
import {
  IconHome,
  IconCalendar,
  IconUpload,
  IconChart,
  IconLink,
  IconLogout,
  IconChevron,
  IconCard,
  IconUsers,
  IconHeart,
  IconPlus,
  IconSettings,
  IconAvatar,
  IconSun,
  IconMoon
} from "./icons";
import { UpgradeButton, UpgradeGem } from "./upgrade-gem";

const NAV = [
  { href: "/dashboard", label: "Vue d'ensemble", icon: IconHome },
  { href: "/calendar", label: "Calendrier", icon: IconCalendar },
  { href: "/composer", label: "Importation", icon: IconUpload },
  { href: "/analytics", label: "Analytics", icon: IconChart },
  { href: "/accounts", label: "Comptes", icon: IconLink },
  { href: "/community", label: "Communauté", icon: IconUsers },
  { href: "/billing", label: "Facturation", icon: IconCard },
  { href: "/settings", label: "Paramètres", icon: IconSettings }
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

export function TopNav() {
  const pathname = usePathname();
  const { brands, activeBrand, setActiveBrandId, createBrand } = useBrand();
  const toast = useToast();
  const { mode, setMode } = useMode();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [plan, setPlan] = useState<Plan>("FREE");
  const [maxBrands, setMaxBrands] = useState(1);
  const [brandsOwned, setBrandsOwned] = useState(0);

  const [brandSwitcherOpen, setBrandSwitcherOpen] = useState(false);
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
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
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
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void-950/90 backdrop-blur">
      {/* Ligne 1 — logo, onglets, actions de compte */}
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <Link href="/dashboard" className="mr-2 flex shrink-0 items-center gap-2">
          {whiteLabel.logoUrl ? (
            <>
              <img src={whiteLabel.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
              <span className="hidden font-display text-lg font-semibold text-white sm:inline">
                {whiteLabel.brandName || "Nebula"}
              </span>
            </>
          ) : (
            // Logo officiel Nebula (icône + wordmark), fourni par l'utilisateur —
            // remplace l'ancien carré dégradé + texte généré.
            <img src="/brand/nebula-logo.png" alt="Nebula" className="h-9 w-auto" />
          )}
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            const needsAttention = item.href === "/accounts" && connections.length === 0 && Boolean(activeBrand);
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
                <span className="relative">
                  <Icon className={clsx("h-4 w-4", active ? "text-aurora-300" : "text-slate-500")} />
                  {needsAttention && (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent-magenta ring-2 ring-void-950"
                      title="Connectez un réseau pour commencer"
                    />
                  )}
                </span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/support"
          title="Soutenir Nebula"
          className={clsx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition",
            pathname === "/support" ? "bg-white/5 text-accent-magenta" : "text-slate-400 hover:bg-white/5 hover:text-white"
          )}
        >
          <IconHeart className="h-[18px] w-[18px]" />
        </Link>

        {/* Bulle de profil — bascule Sombre/Clair (voir mode-provider.tsx),
            appliquée par-dessus n'importe lequel des 14 thèmes de couleurs. */}
        <div className="relative shrink-0" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            title="Profil"
            className={clsx(
              "flex h-9 w-9 items-center justify-center rounded-full border transition",
              profileOpen
                ? "border-aurora-400/60 bg-aurora-400/10 text-white"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-aurora-400/40 hover:text-white"
            )}
          >
            <IconAvatar className="h-4 w-4" />
          </button>
          {profileOpen && (
            <div className="glass-panel-solid absolute right-0 top-[calc(100%+6px)] z-20 w-60 rounded-xl p-3">
              <p className="px-1 pb-2 text-[11px] uppercase tracking-wide text-slate-500">Apparence</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("dark")}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 py-2.5 text-xs transition",
                    mode === "dark" ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25"
                  )}
                >
                  <IconMoon className="h-4 w-4" />
                  Sombre
                </button>
                <button
                  onClick={() => setMode("light")}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 py-2.5 text-xs transition",
                    mode === "light" ? "border-aurora-400 bg-white/[0.04] text-white" : "border-white/10 text-slate-400 hover:border-white/25"
                  )}
                >
                  <IconSun className="h-4 w-4" />
                  Clair
                </button>
              </div>
              <p className="mt-2 px-1 text-[11px] text-slate-500">
                S&apos;applique par-dessus votre thème de couleurs actuel.
              </p>
              <Link
                href="/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-2 flex items-center gap-1.5 rounded-lg border-t border-white/[0.06] px-1 pt-2.5 text-xs text-aurora-300 hover:underline"
              >
                <IconSettings className="h-3.5 w-3.5" /> Paramètres du compte
              </Link>
            </div>
          )}
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Déconnexion"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <IconLogout className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Ligne 2 — marque active, comptes connectés, mise à niveau */}
      <div className="flex h-14 items-center gap-3 border-t border-white/[0.04] px-4 sm:px-6">
        <div className={clsx("relative shrink-0", plan !== "FREE" && "glow-border-gold rounded-xl")} ref={brandSwitcherRef}>
          <button
            onClick={() => setBrandSwitcherOpen((v) => !v)}
            title="Changer de marque ou gérer votre compte"
            className="glass-panel flex items-center gap-2 rounded-xl px-3 py-1.5 text-left"
          >
            <IconAvatar className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="max-w-[140px] truncate text-sm font-medium text-white">
                  {activeBrand?.name ?? "Sélectionner une marque"}
                </p>
                <span
                  className={clsx(
                    "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    PLAN_BADGE_STYLE[plan],
                    plan !== "FREE" && "shadow-[0_0_8px_rgba(234,179,8,0.3)]"
                  )}
                >
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
  );
}
