"use client";

// Menu du profil, en haut à droite — refonte V2 (07/10/2026, maquette C de
// Lucas). Tout ce qui concerne le COMPTE quitte la barre latérale et se
// retrouve ici :
//   - en-tête : avatar, nom, marque active et palier ;
//   - Mon profil, Facturation (palier), Automatisations, Soutenir Nebula ;
//   - ADMINISTRATION (compte propriétaire seulement) : Statistiques
//     anonymes, Partenaires, Journal des mises à jour, puis « Toute
//     l'administration » qui déplie les autres pages ;
//   - apparence (clair / sombre), changer de marque, changer de compte,
//     Paramètres, se déconnecter, numéro de version. « Paramètres » est
//     descendu près de « Se déconnecter » le 08/10/2026 (demande de Lucas) :
//     les réglages du compte sont regroupés en bas, le haut est plus aéré.
// Style (08/10/2026) : lignes .nb-menu-item (survol violet doux, léger
// enfoncement au clic), ouverture animée de .nb-popover (globals.css).
// « Changer de marque » et « Changer de compte » s'ouvrent dans le menu
// lui-même (vue suivante, avec retour), sans nouvelle fenêtre.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { clsx } from "@/lib/clsx";
import { RemoteImage } from "@/components/ui/remote-image";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useBrand } from "@/components/brand-context";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/dashboard/toast";
import { useCosmetics } from "@/components/cosmetics-provider";
import { AvatarRing, useMyRing } from "@/components/reussites/avatar-ring";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { limitsOf } from "@/lib/plans";
import { ACCOUNT_NAV_ITEMS, OWNER_MENU_FEATURED, OWNER_NAV_ITEMS, type NavItem } from "./navigation";
import { BrandList, PLAN_LABEL, PlanBadge } from "./brand-switcher";
import { LinkedAccountsList, useLinkedAccounts } from "./account-switcher";
import { openProfilePanel } from "./profile-panel-events";
import { UpgradeGem } from "./upgrade-gem";
import { IconChevron, IconChevronLeft, IconChevronRight, IconLogout, IconMoon, IconSun, IconSwap, IconUser, IconUsers } from "./icons";
// Import JSON direct (resolveJsonModule) : le numéro de version, jamais recopié à la main.
import packageJson from "../../../package.json";

type View = "main" | "brands" | "accounts";

/** « Paramètres » : en bas du menu, juste avant « Se déconnecter ». */
const SETTINGS_HREF = "/settings";
const settingsItem = ACCOUNT_NAV_ITEMS.find((item) => item.href === SETTINGS_HREF) ?? null;

/** Initiales d'un nom (« Inès Martin » → « IM »), sinon de l'adresse. */
export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
    return letters.toUpperCase();
  }
  return (email ?? "?").slice(0, 2).toUpperCase();
}

function UserAvatar({ image, initials, size, className }: { image: string | null; initials: string; size: number; className?: string }) {
  return image ? (
    <RemoteImage src={image} className={clsx("shrink-0 rounded-full", size >= 44 ? "h-11 w-11" : size >= 36 ? "h-9 w-9" : "h-7 w-7", className)} sizes={`${size}px`} />
  ) : (
    <span
      className={clsx("nb-avatar-initials flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function ProfileMenu({ oauth, isOwner }: { oauth?: { google: boolean; apple: boolean; facebook: boolean }; isOwner?: boolean }) {
  const { data } = useBootstrap();
  const { brands, activeBrand } = useBrand();
  const { mode, setMode } = useMode();
  const toast = useToast();
  const cosmetics = useCosmetics();
  const myRing = useMyRing();
  const linked = useLinkedAccounts();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("main");
  const [adminOpen, setAdminOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const plan = data?.plan ?? "FREE";
  const activeLinked = linked.accounts.find((a) => a.active) ?? null;
  const name = data?.user.name || activeLinked?.name || "Mon compte";
  const email = data?.user.email || activeLinked?.email || null;
  const image = data?.user.avatarUrl ?? activeLinked?.image ?? null;
  const initials = initialsOf(data?.user.name || activeLinked?.name, email);
  const canAddAccount = Boolean(oauth?.google);
  const showAccounts = canAddAccount || linked.accounts.length > 1;
  const upgradeTo = data ? limitsOf(data.plan).upgradeTo : null;

  // Fermeture : clic à côté, Échap (le focus revient sur l'avatar).
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      setView("main");
      setAdminOpen(false);
    }
  }, [open]);
  const close = () => setOpen(false);

  // --- Easter egg « avatar-double-tap » : double-clic sur l'avatar du menu --
  const [heart, setHeart] = useState(false);

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

  const rowClass = "nb-menu-item flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] text-slate-200";
  const iconClass = "nb-menu-icon h-[18px] w-[18px] shrink-0 text-slate-400";

  const facturationMeta = data?.onTrial ? `${PLAN_LABEL[plan]} · ${data.trialDaysLeft} j` : PLAN_LABEL[plan];

  function accountRow(item: NavItem) {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} role="menuitem" onClick={close} className={rowClass}>
        <Icon className={iconClass} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.href === "/billing" && <span className="shrink-0 text-[12px] text-slate-500">{facturationMeta}</span>}
      </Link>
    );
  }

  const featuredAdmin = OWNER_NAV_ITEMS.filter((i) => (OWNER_MENU_FEATURED as readonly string[]).includes(i.href));
  const otherAdmin = OWNER_NAV_ITEMS.filter((i) => !(OWNER_MENU_FEATURED as readonly string[]).includes(i.href));

  return (
    <div className="relative shrink-0" ref={ref} data-tour="brand-switcher">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Votre compte : ${name}${activeBrand ? `, marque ${activeBrand.name}` : ""}`}
        title="Votre compte"
        data-tour="profile-menu"
        className={clsx("flex h-10 w-10 items-center justify-center rounded-full transition", open ? "ring-2 ring-aurora-400/60" : "hover:ring-2 hover:ring-[color:var(--nb-sep-strong)]")}
      >
        <AvatarRing ring={myRing} shapeClassName="rounded-full">
          <UserAvatar image={image} initials={initials} size={36} />
        </AvatarRing>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="nb-popover absolute right-0 top-[calc(100%+8px)] z-50 max-h-[calc(100vh-88px)] w-[330px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl p-2"
        >
          {view === "main" && (
            <>
              {/* En-tête : qui, quelle marque, quel palier */}
              <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
                <span
                  className="relative isolate inline-flex"
                  onDoubleClick={() => {
                    setHeart(true);
                    reportEasterEggFound("avatar-double-tap");
                    window.setTimeout(() => setHeart(false), 700);
                  }}
                >
                  {cosmetics.has("halo-dore-avatar") && (
                    <>
                      <span className="nebula-avatar-halo rounded-full" aria-hidden="true" />
                      <span className="nebula-avatar-halo-spark" aria-hidden="true" />
                    </>
                  )}
                  {cosmetics.has("anneau-saturne-avatar") && <span className="nebula-avatar-saturn" aria-hidden="true" />}
                  <AvatarRing ring={myRing} shapeClassName="rounded-full">
                    <UserAvatar image={image} initials={initials} size={44} className="relative z-[1]" />
                  </AvatarRing>
                  {cosmetics.has("anneau-saturne-avatar") && <span className="nebula-avatar-saturn-front" aria-hidden="true" />}
                  {heart && (
                    <span className="pointer-events-none absolute -top-3 left-3 z-10 text-lg" style={{ animation: "nebula-avatar-heart 0.7s ease-out forwards" }} aria-hidden="true">
                      ❤️
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-white">{name}</span>
                  <span className="block truncate text-[13px] text-slate-500">{activeBrand ? `Marque : ${activeBrand.name}` : (email ?? "")}</span>
                </span>
                <PlanBadge plan={plan} className="shrink-0" />
              </div>

              {/* Rang de créateur (masqué en Mode focus) */}
              {data?.reussites && data.focusMode === false && (
                <Link href="/reussites" onClick={close} className="mx-2.5 mb-2 block rounded-lg px-0 py-1 text-[12px] text-slate-400 transition hover:text-white">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      Rang · <span className="font-medium text-slate-200">{data.reussites.name}</span>
                    </span>
                    <span className="tabular-nums">{data.reussites.pct} %</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[color:var(--nb-active)]">
                    <span className="block h-full rounded-full bg-aurora-400" style={{ width: `${data.reussites.pct}%` }} />
                  </span>
                </Link>
              )}

              <div className="my-1 h-px bg-[color:var(--nb-sep)]" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  openProfilePanel();
                }}
                className={rowClass}
              >
                <IconUser className={iconClass} />
                <span className="flex-1">Mon profil</span>
                <span className="shrink-0 text-[12px] text-slate-500">badges · parrainage</span>
              </button>
              {ACCOUNT_NAV_ITEMS.filter((item) => item.href !== SETTINGS_HREF).map(accountRow)}
              {upgradeTo && (
                <Link href="/billing" role="menuitem" onClick={close} className={clsx(rowClass, "text-aurora-300")}>
                  <UpgradeGem className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1">Mettre à niveau</span>
                  <span className="shrink-0 text-[12px] text-slate-500">{PLAN_LABEL[upgradeTo]}</span>
                </Link>
              )}

              {isOwner && (
                <>
                  <div className="my-1 h-px bg-[color:var(--nb-sep)]" />
                  <p className="px-2.5 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Administration</p>
                  {featuredAdmin.map((item) => (
                    <Link key={item.href} href={item.href} role="menuitem" onClick={close} className={clsx(rowClass, "pl-[42px]")}>
                      {item.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAdminOpen((v) => !v)}
                    aria-expanded={adminOpen}
                    className={clsx(rowClass, "pl-[42px] text-slate-400")}
                  >
                    <span className="flex-1">Toute l&apos;administration ({OWNER_NAV_ITEMS.length})</span>
                    <IconChevron className={clsx("h-4 w-4 transition-transform", !adminOpen && "-rotate-90")} />
                  </button>
                  {adminOpen &&
                    otherAdmin.map((item) => (
                      <Link key={item.href} href={item.href} role="menuitem" onClick={close} className={clsx(rowClass, "py-1.5 pl-[54px] text-[13px] text-slate-400")}>
                        {item.label}
                      </Link>
                    ))}
                </>
              )}

              <div className="my-1 h-px bg-[color:var(--nb-sep)]" />

              {/* Apparence */}
              <div className="flex items-center gap-3 px-2.5 py-1.5">
                <span className="flex-1 text-[14px] text-slate-200">Apparence</span>
                <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-[color:var(--nb-sep)] p-0.5" role="group" aria-label="Apparence">
                  <button
                    type="button"
                    onClick={() => handleModeClick("light")}
                    aria-pressed={mode === "light"}
                    className={clsx("nb-menu-item flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]", mode === "light" ? "nb-menu-item-current" : "text-slate-400")}
                  >
                    <IconSun className="h-3.5 w-3.5" /> Clair
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeClick("dark")}
                    aria-pressed={mode === "dark"}
                    className={clsx("nb-menu-item flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]", mode === "dark" ? "nb-menu-item-current" : "text-slate-400")}
                  >
                    <IconMoon className="h-3.5 w-3.5" /> Sombre
                  </button>
                </div>
              </div>

              <button type="button" role="menuitem" onClick={() => setView("brands")} className={rowClass} data-testid="profile-switch-brand">
                <IconSwap className={iconClass} />
                <span className="flex-1">Changer de marque</span>
                <span className="shrink-0 text-[12px] text-slate-500">{brands.length > 1 ? `${brands.length} marques` : "1 marque"}</span>
                <IconChevronRight className="nb-menu-icon h-4 w-4 shrink-0 text-slate-500" />
              </button>
              {showAccounts && (
                <button type="button" role="menuitem" onClick={() => setView("accounts")} className={rowClass}>
                  <IconUsers className={iconClass} />
                  <span className="flex-1">Changer de compte</span>
                  <IconChevronRight className="nb-menu-icon h-4 w-4 shrink-0 text-slate-500" />
                </button>
              )}
              {settingsItem && accountRow(settingsItem)}
              <button type="button" role="menuitem" onClick={() => signOut({ callbackUrl: "/login" })} className={rowClass}>
                <IconLogout className={iconClass} />
                <span className="flex-1">Se déconnecter</span>
              </button>

              <div className="mt-1 flex items-center justify-between px-2.5 pb-1 pt-1.5">
                <span className="truncate text-[11px] text-slate-500">{email}</span>
                <button type="button" onClick={onVersionClick} className={clsx("text-[11px] text-slate-500 transition", versionPulse && "text-aurora-300")}>
                  v{packageJson.version}
                </button>
              </div>
            </>
          )}

          {view !== "main" && (
            <>
              <button type="button" onClick={() => setView("main")} className="nb-menu-item mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-400">
                <IconChevronLeft className="h-4 w-4" />
                {view === "brands" ? "Changer de marque" : "Changer de compte"}
              </button>
              <div className="my-1 h-px bg-[color:var(--nb-sep)]" />
              {view === "brands" ? (
                <BrandList onDone={close} />
              ) : (
                <>
                  <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Comptes sur cet appareil</p>
                  <LinkedAccountsList linked={linked} activeImage={data?.user.avatarUrl ?? null} canAddAccount={canAddAccount} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
