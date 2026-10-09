"use client";

// Barre latérale — refonte V2 (07/10/2026, maquettes A et B de Lucas).
//   - « Vue d'ensemble » seule en haut, puis cinq catégories repliables
//     (accordéons) : Créer, Analyser, Présence, Clients, Communauté. La
//     catégorie de la page ouverte se déplie d'office ; les autres gardent
//     l'état choisi, mémorisé sur cet appareil.
//   - Mode réduit (icônes seules, maquette B) : les catégories deviennent de
//     simples séparateurs, chaque icône a une infobulle (nom + une ligne).
//   - Plus de compte ici : Paramètres, Facturation, Automatisations, Soutenir
//     Nebula, l'administration, la marque, le mode clair/sombre et la
//     déconnexion sont dans le menu du profil (profile-menu.tsx).
// Le même composant sert la colonne fixe (ordinateur) et le tiroir
// (téléphone). La navigation vient de navigation.ts, source unique partagée
// avec la barre d'onglets mobile et la palette Cmd/Ctrl+K.
import Link from "next/link";
import { RemoteImage } from "@/components/ui/remote-image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { useCosmetics } from "@/components/cosmetics-provider";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { useBootstrap } from "@/components/bootstrap-provider";
import { SidebarShootingStars } from "@/components/cosmetics/sidebar-shooting-stars";
import { getPref, setPref } from "@/lib/ui-prefs-client";
import { NAV_GROUPS, isNavActive, navGroupKeyFor, type NavGroup, type NavItem } from "./navigation";
import { NebulaIcon } from "./nebula-brandmark";
import { IconChevron, IconChevronsLeft, IconChevronsRight, IconClose } from "./icons";

// Easter egg « logo-spin » : appui long sur le logo → rotation accélérée.
const LOGO_SPIN_HOLD_MS = 3000;
const LOGO_SPIN_DURATION_MS = 3200;
const LOGO_SPIN_TOTAL_DEGREES = 2200;

/** Catégories dépliées, mémorisées sur cet appareil (clés de NAV_GROUPS). */
const OPEN_GROUPS_KEY = "nebula:nav-groups-open";
const DEFAULT_OPEN_GROUPS = ["creer"];

interface SidebarNavProps {
  /** Colonne repliée (icônes seules) — ordinateur uniquement. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Tiroir mobile : bouton de fermeture + fermeture après un clic. */
  onClose?: () => void;
  brandName: string;
  logoUrl?: string | null;
}

interface Tip {
  label: string;
  description?: string;
  top: number;
  left: number;
}

export function SidebarNav({ collapsed = false, onToggleCollapsed, onClose, brandName, logoUrl }: SidebarNavProps) {
  const pathname = usePathname();
  // Compteur « Réussites » (bootstrap /api/me, tenu à jour en direct).
  const { data: bootstrap } = useBootstrap();
  const reussites = bootstrap?.reussites ?? null;
  const cosmetics = useCosmetics();

  // --- Accordéons -----------------------------------------------------------
  const activeGroup = navGroupKeyFor(pathname);
  const [openGroups, setOpenGroups] = useState<string[]>(() => DEFAULT_OPEN_GROUPS);
  useEffect(() => {
    try {
      const saved = getPref(OPEN_GROUPS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setOpenGroups(parsed.filter((k): k is string => typeof k === "string"));
      }
    } catch {
      // stockage indisponible : catégories par défaut
    }
  }, []);
  // La catégorie de la page ouverte est toujours dépliée.
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]));
  }, [activeGroup]);
  const toggleGroup = useCallback((key: string) => {
    setOpenGroups((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        setPref(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // sans gravité
      }
      return next;
    });
  }, []);

  // --- Infobulles du mode réduit (position fixe : la colonne défile) --------
  const [tip, setTip] = useState<Tip | null>(null);
  const showTip = (el: HTMLElement, label: string, description?: string) => {
    if (!collapsed) return;
    const r = el.getBoundingClientRect();
    setTip({ label, description, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);
  useEffect(() => setTip(null), [pathname, collapsed]);

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

  // --- Easter egg « keyboard-nav » : atteindre le bas du menu au clavier ----
  const lastFocusWasMouse = useRef(false);
  const keyboardNavProps = {
    onFocus: () => {
      // Dernier élément focusable du menu : l'atteindre au clavier (Tab)
      // prouve qu'on a parcouru tout le menu sans souris. Pas sur un clic.
      if (!lastFocusWasMouse.current) reportEasterEggFound("keyboard-nav");
    },
    onMouseDown: () => {
      lastFocusWasMouse.current = true;
    },
    onBlur: () => {
      lastFocusWasMouse.current = false;
    }
  };

  // Compteur Réussites : défis et accomplissements validés depuis la
  // dernière visite (rien en Mode focus, ni quand tout a été vu).
  const unseen = reussites && reussites.unseen > 0 && bootstrap?.focusMode === false ? reussites.unseen : 0;
  const eggBadge = unseen > 0 ? String(unseen > 99 ? "99+" : unseen) : null;

  function renderItem(item: NavItem, extra?: React.HTMLAttributes<HTMLAnchorElement>) {
    const active = isNavActive(item.href, pathname);
    const Icon = item.icon;
    const badge = item.href === "/reussites" ? eggBadge : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        data-tour={`nav-${item.href.slice(1)}`}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? (badge ? `${item.label} — ${badge} nouveauté(s)` : item.label) : undefined}
        onMouseEnter={(e) => showTip(e.currentTarget, item.label, item.description)}
        onMouseLeave={hideTip}
        onFocus={(e) => showTip(e.currentTarget, item.label, item.description)}
        onBlur={hideTip}
        className={clsx(
          "nb-nav-item group relative flex items-center rounded-lg text-[14px] transition",
          collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-3 px-3 py-2",
          // 09/10/2026 (demande de Lucas, comme ElevenLabs) : pages en gris
          // clair, texte normal ; la page ouverte en gras blanc, icône pleine.
          active ? "nb-nav-item-active font-semibold text-white" : "font-normal text-slate-300 hover:text-white"
        )}
        {...extra}
      >
        {/* Icônes du menu (09/10/2026) : 24 px, traits épais, pleines sur la page ouverte (nav-icons.tsx). */}
        <Icon
          filled={active}
          className={clsx("h-6 w-6 shrink-0", active ? "text-white" : item.href === "/studio" ? "nb-ai-nav text-slate-300" : "text-slate-300 group-hover:text-white")}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {badge &&
          (collapsed ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          ) : (
            <span
              className="ml-auto shrink-0 rounded-full border border-amber-400/40 bg-amber-400/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-amber-200"
              aria-label={`${badge} nouveauté(s) dans Réussites`}
            >
              {badge}
            </span>
          ))}
      </Link>
    );
  }

  function renderGroup(group: NavGroup, index: number) {
    if (!group.label) {
      return (
        <div key={group.key} className="space-y-0.5">
          {group.items.map((item) => renderItem(item))}
        </div>
      );
    }
    if (collapsed) {
      // Mode réduit : un séparateur fin entre catégories, toutes les icônes.
      return (
        <div key={group.key} className="space-y-1">
          <div className="mx-auto my-2 h-px w-8 bg-[color:var(--nb-sep)]" aria-hidden="true" />
          {group.items.map((item) => renderItem(item))}
        </div>
      );
    }
    const open = openGroups.includes(group.key);
    const groupBadge = !open && group.items.some((i) => i.href === "/reussites") ? eggBadge : null;
    const panelId = `nav-group-${group.key}`;
    const isLastGroup = index === NAV_GROUPS.length - 1;
    return (
      <div key={group.key} className="pt-3">
        <button
          type="button"
          onClick={() => toggleGroup(group.key)}
          aria-expanded={open}
          aria-controls={panelId}
          data-tour={`nav-group-${group.key}`}
          // Catégories en gras et plus claires (09/10/2026) : toujours en majuscules
          // pour les distinguer des pages.
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-300 transition hover:text-white"
        >
          <span className="flex items-center gap-2">
            {group.label}
            {groupBadge && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label={`${groupBadge} nouveauté(s) dans Réussites`} />}
          </span>
          <IconChevron className={clsx("h-4 w-4 transition-transform duration-200", !open && "-rotate-90")} />
        </button>
        <div id={panelId} hidden={!open} className="mt-1 space-y-0.5">
          {group.items.map((item, i) =>
            // Tiroir (téléphone) : le dernier lien porte l'easter egg « keyboard-nav ».
            onClose && isLastGroup && i === group.items.length - 1 ? renderItem(item, keyboardNavProps) : renderItem(item)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {cosmetics.has("sidebar-poussiere-etoiles") && <SidebarShootingStars />}

      {/* Logo (+ fermeture du tiroir sur téléphone) */}
      <div className={clsx("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between px-5")}>
        <Link href="/dashboard" onClick={onClose} className="flex min-w-0 items-center gap-2.5" aria-label={`${brandName} — vue d'ensemble`}>
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
          {!collapsed && <span className="truncate font-display text-[19px] font-semibold text-white">{brandName}</span>}
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[color:var(--nb-hover)] hover:text-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Navigation principale" className={clsx("nb-thin-scroll flex-1 overflow-y-auto pb-4 pt-2", collapsed ? "px-2" : "px-3")}>
        {NAV_GROUPS.map(renderGroup)}
      </nav>

      {/* Pied : réduire / déplier (ordinateur) */}
      {onToggleCollapsed && (
        // Sans trait au-dessus (09/10/2026, demande de Lucas : « épurer »).
        <div className={clsx("shrink-0 py-3", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Déplier le menu" : "Réduire le menu"}
            onMouseEnter={(e) => showTip(e.currentTarget, "Déplier le menu")}
            onMouseLeave={hideTip}
            {...keyboardNavProps}
            onFocus={(e) => {
              keyboardNavProps.onFocus();
              showTip(e.currentTarget, "Déplier le menu");
            }}
            onBlur={() => {
              keyboardNavProps.onBlur();
              hideTip();
            }}
            className={clsx(
              "flex items-center rounded-lg text-[14px] font-medium text-slate-300 transition hover:bg-[color:var(--nb-hover)] hover:text-white",
              collapsed ? "mx-auto h-11 w-11 justify-center" : "w-full gap-3 px-3 py-2"
            )}
          >
            {collapsed ? <IconChevronsRight className="h-6 w-6 [stroke-width:2]" /> : <IconChevronsLeft className="h-6 w-6 [stroke-width:2]" />}
            {!collapsed && "Réduire le menu"}
          </button>
        </div>
      )}

      {/* Infobulle du mode réduit (maquette B) */}
      {collapsed && tip && (
        <div
          role="tooltip"
          className="nb-rail-tip pointer-events-none fixed z-[60] max-w-[260px] -translate-y-1/2 rounded-lg px-3 py-2 shadow-lg"
          style={{ top: tip.top, left: tip.left }}
        >
          <p className="text-[13px] font-semibold">{tip.label}</p>
          {tip.description && <p className="mt-0.5 text-[12px] opacity-75">{tip.description}</p>}
        </div>
      )}
    </div>
  );
}
