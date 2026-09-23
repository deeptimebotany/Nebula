"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import { useMode } from "@/components/mode-provider";
import { useBrand } from "@/components/brand-context";
import { useFocusMode } from "@/components/bootstrap-provider";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { NAV_GROUPS, OWNER_NAV_ITEM, SUCCESS_NAV_ITEM, type NavIcon } from "./navigation";
import { IconAvatar, IconCommand, IconFocus, IconMoon, IconPlus, IconSun } from "./icons";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: NavIcon;
  keywords?: string[];
  run: () => void;
}

const OPEN_EVENT = "nebula:open-palette";

/** Ouvre la palette depuis n'importe quel composant (bouton « Rechercher » de l'en-tête). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/**
 * Palette de commandes globale (Cmd/Ctrl+K) : navigue et agit sans la
 * souris. Depuis le Lot 3, ses destinations viennent de navigation.ts — la
 * même source que la barre latérale — plus quelques actions (nouvelle
 * publication, changer de marque, mode clair/sombre, Mode focus).
 */
export function CommandPalette({ isOwner = false }: { isOwner?: boolean }) {
  const router = useRouter();
  const { mode, setMode } = useMode();
  const { brands, activeBrand, setActiveBrandId } = useBrand();
  const { focusMode, setFocusMode } = useFocusMode();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(() => {
    const nav: Command[] = NAV_GROUPS.flatMap((g) =>
      g.items.map((item) => ({
        id: item.href,
        label: item.label,
        hint: item.description,
        icon: item.icon,
        keywords: item.keywords,
        run: () => router.push(item.href)
      }))
    );
    if (isOwner) {
      nav.push({ id: OWNER_NAV_ITEM.href, label: OWNER_NAV_ITEM.label, hint: OWNER_NAV_ITEM.description, icon: OWNER_NAV_ITEM.icon, run: () => router.push(OWNER_NAV_ITEM.href) });
    }
    const actions: Command[] = [
      { id: "new-post", label: "Nouvelle publication", hint: "Publier", icon: IconPlus, keywords: ["nouveau post", "créer", "composer"], run: () => router.push("/composer") },
      ...brands
        .filter((b) => b.id !== activeBrand?.id)
        .map((b) => ({ id: `brand-${b.id}`, label: `Passer à la marque « ${b.name} »`, hint: "Marque", icon: IconAvatar, keywords: ["marque", "espace"], run: () => setActiveBrandId(b.id) })),
      {
        id: "toggle-mode",
        label: mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre",
        hint: "Apparence",
        icon: mode === "dark" ? IconSun : IconMoon,
        keywords: ["thème", "clair", "sombre"],
        run: () => setMode(mode === "dark" ? "light" : "dark")
      },
      {
        id: "toggle-focus",
        label: focusMode ? "Désactiver le Mode focus" : "Activer le Mode focus",
        hint: focusMode ? "Réactive les surprises et notifications de succès" : "Coupe les surprises et notifications de succès",
        icon: IconFocus,
        keywords: ["focus", "easter eggs", "succès", "notifications"],
        run: () => {
          setFocusMode(!focusMode);
        }
      },
      { id: SUCCESS_NAV_ITEM.href, label: SUCCESS_NAV_ITEM.label, hint: SUCCESS_NAV_ITEM.description, icon: SUCCESS_NAV_ITEM.icon, keywords: SUCCESS_NAV_ITEM.keywords, run: () => router.push(SUCCESS_NAV_ITEM.href) }
    ];
    return [...actions.slice(0, 1), ...nav, ...actions.slice(1)];
  }, [router, mode, setMode, brands, activeBrand?.id, setActiveBrandId, focusMode, setFocusMode, isOwner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q) || c.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

  // Easter egg : ouvrir la palette 3 fois de suite en moins de 10 secondes.
  const openCount = useRef(0);
  const openResetTimer = useRef<number | null>(null);

  useEffect(() => {
    function countOpen() {
      openCount.current += 1;
      if (openResetTimer.current) window.clearTimeout(openResetTimer.current);
      if (openCount.current >= 3) {
        openCount.current = 0;
        reportEasterEggFound("command-palette-loop");
      } else {
        openResetTimer.current = window.setTimeout(() => {
          openCount.current = 0;
        }, 10000);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) countOpen();
          return next;
        });
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      countOpen();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function execute(cmd: Command) {
    cmd.run();
    setOpen(false);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) execute(filtered[activeIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setOpen(false)} />
      <div className="glass-panel-solid relative z-10 w-full max-w-lg overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <IconCommand className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Aller à une page ou lancer une action…"
            aria-label="Rechercher une page ou une action"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-500">Esc</kbd>
        </div>
        <div id="command-palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">Aucun résultat.</p>}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setActiveIndex(i)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  i === activeIndex ? "bg-nebula-600/40 text-white" : "text-slate-300"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex-1 truncate">{cmd.label}</span>
                {cmd.hint && <span className="hidden max-w-[45%] truncate text-xs text-slate-500 sm:inline">{cmd.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
