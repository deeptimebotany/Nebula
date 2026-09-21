"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "@/lib/clsx";
import {
  IconHome,
  IconCalendar,
  IconUpload,
  IconChart,
  IconLink,
  IconUsers,
  IconCard,
  IconSettings,
  IconPlus,
  IconCommand,
  IconSun,
  IconMoon
} from "./icons";
import { useMode } from "@/components/mode-provider";
import { useQuickComposer } from "@/components/dashboard/quick-composer-context";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: (props: { className?: string }) => JSX.Element;
  run: () => void;
}

/**
 * Palette de commandes globale (Cmd/Ctrl+K) : navigue et agit sans la
 * souris. Montée une seule fois dans le layout du dashboard (voir
 * (dashboard)/layout.tsx) — s'ouvre/se ferme via un raccourci clavier
 * global, pas besoin de bouton visible.
 */
export function CommandPalette() {
  const router = useRouter();
  const { mode, setMode } = useMode();
  const { open: openQuickComposer } = useQuickComposer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(
    () => [
      { id: "home", label: "Vue d'ensemble", icon: IconHome, run: () => router.push("/dashboard") },
      { id: "new-post", label: "Nouveau post", hint: "Importation", icon: IconPlus, run: () => openQuickComposer() },
      { id: "calendar", label: "Calendrier", icon: IconCalendar, run: () => router.push("/calendar") },
      { id: "composer", label: "Importation", icon: IconUpload, run: () => router.push("/composer") },
      { id: "analytics", label: "Analytics", icon: IconChart, run: () => router.push("/analytics") },
      { id: "accounts", label: "Comptes", icon: IconLink, run: () => router.push("/accounts") },
      { id: "community", label: "Communauté", icon: IconUsers, run: () => router.push("/community") },
      { id: "billing", label: "Facturation", icon: IconCard, run: () => router.push("/billing") },
      { id: "settings", label: "Paramètres", icon: IconSettings, run: () => router.push("/settings") },
      {
        id: "toggle-mode",
        label: mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre",
        icon: mode === "dark" ? IconSun : IconMoon,
        run: () => setMode(mode === "dark" ? "light" : "dark")
      }
    ],
    [router, mode, setMode, openQuickComposer]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setOpen(false)} />
      <div className="glass-panel-solid relative z-10 w-full max-w-md overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <IconCommand className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Aller à... ou lancer une action"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-500">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">Aucun résultat.</p>}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setActiveIndex(i)}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  i === activeIndex ? "bg-nebula-600/40 text-white" : "text-slate-300"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex-1">{cmd.label}</span>
                {cmd.hint && <span className="text-xs text-slate-500">{cmd.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
