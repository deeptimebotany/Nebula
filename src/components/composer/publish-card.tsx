"use client";

// Étape « Publication » de la page Publier : maintenant ou à une date, dans
// le fuseau horaire de la marque (voir src/lib/timezone.ts), avec la barre
// d'action collante (voir ComposerActionBar) qui garde le bouton principal
// visible où que l'on soit dans la page. Extrait de composer/page.tsx au
// Lot 4.
import { useEffect } from "react";
import { clsx } from "@/lib/clsx";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { localInputToUtc, timeZoneLabel } from "@/lib/timezone";
import type { ScheduleMode } from "./composer-types";

interface PublishCardProps {
  mode: ScheduleMode;
  onModeChange: (mode: ScheduleMode) => void;
  scheduleDate: string;
  onScheduleDateChange: (value: string) => void;
  timezone: string;
  shortcutLabel: string;
}

export function PublishCard({ mode, onModeChange, scheduleDate, onScheduleDateChange, timezone, shortcutLabel }: PublishCardProps) {
  const scheduledUtc = mode === "date" && scheduleDate ? localInputToUtc(scheduleDate, timezone) : null;
  const inPast = scheduledUtc ? scheduledUtc.getTime() < Date.now() : false;
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const differentTz = browserTz && browserTz !== timezone;

  return (
    <GlassCard>
      <h2 className="mb-3 font-display text-base font-medium text-white">5. Publication</h2>
      <div className="space-y-2" role="radiogroup" aria-label="Moment de publication">
        {[
          { id: "now" as const, label: "Publier immédiatement" },
          { id: "date" as const, label: "Programmer à une date précise" }
        ].map((opt) => (
          <label
            key={opt.id}
            className={clsx(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
              mode === opt.id ? "border-aurora-400/50 bg-nebula-700/30 text-white" : "border-white/10 text-slate-400 hover:border-white/20"
            )}
          >
            <input type="radio" name="mode" checked={mode === opt.id} onChange={() => onModeChange(opt.id)} className="accent-aurora-500" />
            {opt.label}
          </label>
        ))}
      </div>

      {mode === "date" && (
        <div className="mt-3 space-y-2">
          <DateTimePicker value={scheduleDate} onChange={onScheduleDateChange} timeZone={timezone} />
          <p className="text-[11px] text-slate-500">
            Heure de <span className="text-slate-300">{timezone.replace(/_/g, " ")}</span> ({timeZoneLabel(timezone, scheduledUtc ?? new Date())})
            {differentTz && (
              <>
                {" "}
                — différent de votre appareil ({browserTz}). Modifiable dans Paramètres → Marque.
              </>
            )}
          </p>
          {inPast && <p className="text-xs text-amber-300">Cette date est déjà passée : la publication partirait au prochain passage du planificateur.</p>}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">Astuce : {shortcutLabel}+Entrée publie sans lâcher le clavier.</p>
    </GlassCard>
  );
}

interface ComposerActionBarProps {
  mode: ScheduleMode;
  scheduleDate: string;
  timezone: string;
  selectedCount: number;
  hasMedia: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

/** Barre d'action collante en bas de la page Publier : résumé + bouton principal toujours visible. */
export function ComposerActionBar({ mode, scheduleDate, timezone, selectedCount, hasMedia, canSubmit, submitting, onSubmit }: ComposerActionBarProps) {
  const scheduledUtc = mode === "date" && scheduleDate ? localInputToUtc(scheduleDate, timezone) : null;
  const when =
    mode === "now"
      ? "Publication immédiate"
      : scheduledUtc
        ? `Programmée le ${scheduledUtc.toLocaleString("fr-FR", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
        : "Choisissez une date";
  const missing = !hasMedia ? "Ajoutez un média pour continuer" : selectedCount === 0 ? "Choisissez au moins un réseau" : null;

  // Le bouton flottant de l'assistant remonte au-dessus de cette barre au
  // lieu de cacher « Publier maintenant » (voir ai-assistant-lazy.tsx, lot 5).
  useEffect(() => {
    document.documentElement.classList.add("nebula-action-bar");
    return () => document.documentElement.classList.remove("nebula-action-bar");
  }, []);

  return (
    <div className="sticky bottom-[4.75rem] z-20 lg:bottom-4">
      <div className="glass-panel-solid flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-glow-lg">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {selectedCount === 0 ? "Aucun réseau sélectionné" : selectedCount === 1 ? "1 réseau" : `${selectedCount} réseaux`} · {when}
          </p>
          <p className="truncate text-xs text-slate-500">{missing ?? (mode === "now" ? "Envoyée dès que vous cliquez." : `Heure de ${timezone.replace(/_/g, " ")}.`)}</p>
        </div>
        {/* disabled={submitting} SEULEMENT (pas !canSubmit) : le bouton doit
            rester cliquable quand canSubmit est faux, pour l'easter egg des
            20 clics (voir composer/page.tsx) — la garde reste dans onSubmit. */}
        <Button
          className={clsx("shrink-0 whitespace-nowrap", !canSubmit && !submitting && "cursor-not-allowed opacity-50")}
          disabled={submitting}
          aria-disabled={!canSubmit}
          onClick={onSubmit}
        >
          {submitting ? "Envoi..." : mode === "now" ? "Publier maintenant" : "Programmer"}
        </Button>
      </div>
    </div>
  );
}
