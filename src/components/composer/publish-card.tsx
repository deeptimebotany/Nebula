"use client";

// « QUAND » de la page Publier — refonte V2 (07/10/2026, maquettes de Lucas).
// Une ligne au bas du formulaire : à gauche le moment prévu (la date choisie,
// sinon votre meilleur créneau tiré de vos vrais chiffres), à droite
// « Programmer » et « Publier maintenant ». Le même duo de boutons monte dans
// la barre du haut sur les écrans moyens (maquette E) et dans une barre
// collée en bas sur téléphone. L'heure est celle du fuseau de la marque
// (voir src/lib/timezone.ts).
//
// Avant (Lot 4) : une carte « 5. Publication » (deux boutons radio) et une
// barre d'action collante à part.
//
// 09/10/2026 (demande de Lucas) : « Programmer » ouvre directement le
// calendrier (DateTimePopover), présélectionné sur la date déjà choisie
// (clic sur une case du calendrier) ou sur votre meilleur créneau ; son
// bouton « Programmer » envoie. Plus de « Changer la date » ni de « Ne pas
// programmer » sous « Quand » : « Publier maintenant » publie tout de suite.
import { useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { Button } from "@/components/ui/button";
import { DateTimePopover, firstAvailableSlot } from "@/components/ui/date-time-picker";
import { localInputToUtc, timeZoneLabel, utcToLocalInput, utcToWallClock, wallClockToUtc } from "@/lib/timezone";
import type { ScheduleMode } from "./composer-types";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « Vendredi 9 octobre, 18 h 30 » (« 18 h » pile) pour une valeur « YYYY-MM-DDTHH:mm » du fuseau de la marque. */
export function formatSlotLabel(localInput: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localInput);
  if (!m) return "";
  const [year, month, day, hour, minute] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  // Jour de la semaine d'une date du calendrier (sans fuseau : midi UTC).
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()];
  const time = minute === 0 ? `${hour} h` : `${hour} h ${String(minute).padStart(2, "0")}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} ${MONTHS[month - 1]}, ${time}`;
}

/**
 * Prochain passage de l'heure `hour` (heure pile) dans le fuseau `tz`, au
 * moins 30 minutes après `now` : aujourd'hui si c'est encore possible, sinon
 * demain. Valeur « YYYY-MM-DDTHH:mm » du fuseau.
 */
export function nextBestSlot(hour: number, tz: string, now: Date = new Date()): string {
  const today = utcToWallClock(now, tz);
  let at = wallClockToUtc({ year: today.year, month: today.month, day: today.day, hour, minute: 0 }, tz);
  if (at.getTime() - now.getTime() < 30 * 60_000) {
    const tomorrow = utcToWallClock(new Date(now.getTime() + 24 * 3_600_000), tz);
    at = wallClockToUtc({ year: tomorrow.year, month: tomorrow.month, day: tomorrow.day, hour, minute: 0 }, tz);
  }
  return utcToLocalInput(at, tz);
}

interface PublishActionsProps {
  /** Date choisie (mode « date ») : « Programmer » devient le bouton principal. */
  scheduled: boolean;
  canSubmit: boolean;
  submitting: boolean;
  blockedReason?: string | null;
  /** Date retenue dans le calendrier de « Programmer » (« YYYY-MM-DDTHH:mm », fuseau de la marque). */
  onSchedule: (date: string) => void;
  /** Clic sur « Programmer » alors qu'il manque quelque chose (média, réseau…) : message, sans calendrier. */
  onScheduleBlocked?: () => void;
  onPublishNow: () => void;
  /** Valeur de départ du calendrier : date déjà choisie, sinon meilleur créneau. */
  scheduleValue?: string | null;
  /** Fuseau de la marque. */
  timezone?: string;
  /** Meilleur créneau à venir, pour le signaler dans le calendrier. */
  bestSlot?: string | null;
  /** Boutons plus petits (barre du haut). */
  compact?: boolean;
  className?: string;
}

/** « Programmer » + « Publier maintenant » (le principal est violet plein). */
export function PublishActions({
  scheduled,
  canSubmit,
  submitting,
  blockedReason,
  onSchedule,
  onScheduleBlocked,
  onPublishNow,
  scheduleValue,
  timezone,
  bestSlot,
  compact = false,
  className
}: PublishActionsProps) {
  // disabled={submitting} SEULEMENT (pas !canSubmit) : le bouton principal
  // doit rester cliquable quand canSubmit est faux, pour l'easter egg des
  // 20 clics (voir composer/page.tsx) — la garde reste dans l'envoi.
  const size = compact ? "px-3 py-2 text-[13px]" : "px-5 py-2.5";
  const muted = !canSubmit && !submitting && "cursor-not-allowed opacity-50";
  const title = !canSubmit && blockedReason ? blockedReason : undefined;
  // Calendrier de « Programmer » : ouvert sous le bouton, valeur propre à
  // ce calendrier tant qu'on n'a pas confirmé.
  const scheduleRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  function openCalendar() {
    if (!canSubmit) {
      onScheduleBlocked?.();
      return;
    }
    setDraft(scheduleValue || bestSlot || firstAvailableSlot(timezone));
    setPicking((v) => !v);
  }
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const tz = timezone ?? browserTz ?? "Europe/Paris";
  const draftUtc = draft ? localInputToUtc(draft, tz) : null;
  return (
    <div className={clsx("flex shrink-0 items-center gap-2", className)}>
      <Button
        ref={scheduleRef}
        variant={scheduled ? "glow" : "outline"}
        className={clsx("whitespace-nowrap", size, scheduled && muted)}
        disabled={submitting}
        aria-disabled={scheduled ? !canSubmit : undefined}
        aria-haspopup="dialog"
        aria-expanded={picking}
        title={scheduled ? title : undefined}
        onClick={openCalendar}
        data-testid="composer-schedule"
      >
        {submitting && scheduled ? "Envoi..." : "Programmer"}
      </Button>
      <DateTimePopover
        anchorRef={scheduleRef}
        open={picking}
        onClose={() => setPicking(false)}
        value={draft}
        onChange={setDraft}
        timeZone={timezone}
        title="Programmer la publication"
        confirmLabel="Programmer"
        onConfirm={() => {
          setPicking(false);
          if (draft) onSchedule(draft);
        }}
        note={
          <>
            {draft && bestSlot && draft === bestSlot ? <span className="text-aurora-300">Votre meilleur créneau. </span> : null}
            Heure de {tz.replace(/_/g, " ")} ({timeZoneLabel(tz, draftUtc ?? new Date())})
            {browserTz && browserTz !== tz ? `, différente de votre appareil (${browserTz})` : ""}.
          </>
        }
      />
      <Button
        variant={scheduled ? "outline" : "glow"}
        className={clsx("whitespace-nowrap", size, !scheduled && muted)}
        disabled={submitting}
        aria-disabled={!scheduled ? !canSubmit : undefined}
        title={!scheduled ? title : undefined}
        onClick={onPublishNow}
        data-testid="composer-publish-now"
      >
        {submitting && !scheduled ? "Envoi..." : "Publier maintenant"}
      </Button>
    </div>
  );
}

interface WhenSectionProps {
  mode: ScheduleMode;
  scheduleDate: string;
  timezone: string;
  /** Meilleur créneau à venir (« YYYY-MM-DDTHH:mm »), tiré des statistiques réelles, sinon null. */
  bestSlot: string | null;
  shortcutLabel: string;
  actions: React.ReactNode;
  /** Ce qui manque avant de pouvoir publier (média, réseau, TikTok…). */
  missing?: string | null;
  missingTone?: "neutral" | "warning";
  footnote?: React.ReactNode;
}

export function WhenSection({ mode, scheduleDate, timezone, bestSlot, shortcutLabel, actions, missing, missingTone = "neutral", footnote }: WhenSectionProps) {
  const scheduled = mode === "date" && Boolean(scheduleDate);
  const scheduledUtc = scheduled ? localInputToUtc(scheduleDate, timezone) : null;
  const inPast = scheduledUtc ? scheduledUtc.getTime() < Date.now() : false;
  const shown = scheduled ? scheduleDate : bestSlot;
  const isBest = Boolean(shown && bestSlot && shown === bestSlot);

  return (
    <section aria-labelledby="composer-when" className="border-t border-[color:var(--nb-sep)] pt-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="composer-when" className="nb-section-label">
            Quand
          </h2>
          <p className="mt-1.5 text-[16px] text-white" data-testid="composer-when-value">
            {shown ? (
              <>
                {formatSlotLabel(shown)}
                {isBest && <span className="text-slate-500"> · votre meilleur créneau</span>}
              </>
            ) : (
              <span className="text-slate-400">Maintenant, ou à la date de votre choix</span>
            )}
          </p>
          <p className="mt-1 text-[13px] text-slate-400">« Programmer » ouvre le calendrier ; « Publier maintenant » publie tout de suite.</p>
        </div>
        <div className="hidden sm:block">{actions}</div>
      </div>

      {inPast && <p className="mt-2 text-[13px] text-amber-300">Cette date est déjà passée : choisissez une date et une heure à venir.</p>}
      {missing && <p className={clsx("mt-3 text-[13px]", missingTone === "warning" ? "text-amber-300" : "text-slate-500")}>{missing}</p>}
      {footnote}
      <p className="mt-3 hidden text-[12px] text-slate-500 sm:block">Astuce : {shortcutLabel}+Entrée publie sans lâcher le clavier.</p>
    </section>
  );
}
