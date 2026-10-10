"use client";

// Vitrine du créateur (Réussites v2, lot B) : 3 badges gagnés, choisis par
// le créateur (visibles à côté de son nom dans la Communauté et sur sa carte
// de créateur), ses récompenses (où les utiliser, comment gagner les
// autres) et sa carte de créateur, une image à télécharger ou partager.
import Link from "next/link";
import { useState } from "react";
import { ImageShareDialog } from "@/components/reussites/image-share-dialog";
import type { ReussitesPageDTO, ShowcaseDTO } from "@/lib/reussites/types";
import { clsx } from "@/lib/clsx";
import { initialSlots, placeBadge } from "@/lib/reussites/showcase-slots";

const CARD_URL = "/api/reussites/card";

function CreatorCardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ImageShareDialog
      open={open}
      onClose={onClose}
      url={CARD_URL}
      title="Ma carte de créateur"
      intro="Une image rien que pour vous : partagez-la où vous voulez (story, profil). Aucune page publique n'est créée."
      alt="Carte de créateur : rang, constellation, série et vitrine"
      filename="carte-createur-nebula.png"
      shareTitle="Ma carte de créateur Nebula"
    />
  );
}

/**
 * Choix des badges (10/10/2026, retour de Lucas : vitrine pleine = impossible
 * de changer de badge, il fallait deviner qu'on devait d'abord en retirer
 * un). Les places de la vitrine sont en haut : on touche une place, puis le
 * badge à y mettre ; vitrine pleine, le badge choisi remplace celui de la
 * place active (la dernière par défaut). Aucun badge n'est grisé.
 */
function ShowcasePicker({
  showcase,
  busy,
  startSlot,
  onSave,
  onCancel
}: {
  showcase: ShowcaseDTO;
  busy: boolean;
  startSlot?: number;
  onSave: (keys: string[]) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState(() => initialSlots(showcase.selected.map((b) => b.key), showcase.max, startSlot));
  const byKey = new Map(showcase.candidates.map((b) => [b.key, b]));
  const keys = state.slots.filter((k): k is string => Boolean(k));
  const full = keys.length >= showcase.max;
  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-sm text-slate-300">
        {full ? "Touchez une place, puis le badge qui la remplace." : "Touchez les badges à montrer"} ({keys.length} / {showcase.max}).
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Places de la vitrine">
        {state.slots.map((key, i) => {
          const b = key ? byKey.get(key) : null;
          const on = state.active === i;
          return (
            <div
              key={i}
              data-testid="showcase-slot"
              className={clsx(
                "relative flex min-h-[56px] items-center rounded-2xl border transition",
                on ? "border-aurora-400/70 bg-aurora-400/[0.08] ring-1 ring-aurora-400/40" : b ? "border-amber-300/30 bg-amber-300/[0.05]" : "border-dashed border-white/[0.16]"
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => setState((s) => ({ ...s, active: i }))}
                className="flex min-h-[56px] w-full min-w-0 items-center gap-2.5 rounded-2xl p-2.5 pr-9 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-lg" aria-hidden="true">
                  {b ? b.emoji : "+"}
                </span>
                <span className="min-w-0">
                  <span className={clsx("block truncate text-xs", b ? "font-medium text-white" : "text-slate-400")}>{b ? b.label : `Place ${i + 1} libre`}</span>
                  {on && <span className="block text-[10px] text-aurora-300">{b ? "Choisissez un badge pour le remplacer" : "Choisissez un badge"}</span>}
                </span>
              </button>
              {b && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setState((s) => placeBadge(s.slots, s.active, b.key))}
                  aria-label={`Retirer ${b.label} de la vitrine`}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="nb-thin-scroll grid max-h-72 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" role="group" aria-label="Badges gagnés">
        {showcase.candidates.map((b) => {
          const on = keys.includes(b.key);
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => setState((s) => placeBadge(s.slots, s.active, b.key))}
              className={clsx(
                "flex min-h-[40px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition",
                on ? "border-aurora-400/60 bg-aurora-400/[0.12] font-semibold text-white" : "border-white/[0.1] text-slate-300 hover:border-aurora-400/40"
              )}
            >
              <span className="text-base leading-none" aria-hidden="true">
                {b.emoji}
              </span>
              <span className="min-w-0 truncate">{b.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(keys)}
          className="min-h-[40px] rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400 disabled:opacity-60"
        >
          {busy ? "Enregistrement…" : "Enregistrer ma vitrine"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[40px] rounded-xl border border-white/15 px-4 text-sm text-slate-300 transition hover:text-white">
          Annuler
        </button>
      </div>
    </div>
  );
}

export function ShowcaseSection({
  showcase,
  rewards,
  busy,
  onSave,
  highlight,
  collapsed = false,
  onToggleCollapsed
}: {
  showcase: ShowcaseDTO;
  rewards: ReussitesPageDTO["rewards"];
  busy: boolean;
  onSave: (keys: string[]) => Promise<boolean>;
  highlight: boolean;
  /** Bloc replié (lot U3), état mémorisé par la page. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  // Place à changer en ouvrant le choix (une place touchée dans la vitrine), ou -1.
  const [editing, setEditing] = useState<number | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const owned = rewards.filter((r) => r.unlocked);
  const locked = rewards.filter((r) => !r.unlocked);
  const slots = Array.from({ length: showcase.max }, (_, i) => showcase.selected[i] ?? null);

  return (
    <section id="vitrine" aria-labelledby="vitrine-title" className={clsx("scroll-mt-24 space-y-3 rounded-2xl", highlight && "nb-focus-flash")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="vitrine-title" className="font-display text-lg font-semibold text-white">
            Votre vitrine
          </h2>
          <p className="text-xs text-slate-400">3 badges à côté de votre nom dans la Communauté et sur votre carte de créateur.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            className="min-h-[40px] rounded-xl border border-aurora-400/40 bg-aurora-500/[0.08] px-3.5 text-sm font-medium text-aurora-200 transition hover:bg-aurora-500/[0.16]"
          >
            Ma carte de créateur
          </button>
          {onToggleCollapsed && (
            <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} aria-controls="vitrine-body" className="text-xs font-medium text-aurora-300 transition hover:text-white">
              {collapsed ? "Déplier ▾" : "Replier ▴"}
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
      <div id="vitrine-body" className="space-y-3">

      {editing !== null ? (
        <ShowcasePicker
          showcase={showcase}
          busy={busy}
          startSlot={editing >= 0 ? editing : undefined}
          onCancel={() => setEditing(null)}
          onSave={async (keys) => {
            if (await onSave(keys)) setEditing(null);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {slots.map((b, i) =>
            b ? (
              // Une place touchée = la changer directement (10/10/2026).
              <button
                key={b.key}
                type="button"
                onClick={() => setEditing(i)}
                title="Changer ce badge"
                aria-label={`${b.label} : changer ce badge`}
                className="group flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-left transition hover:border-aurora-400/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-xl" aria-hidden="true">
                  {b.emoji}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-white">{b.label}</span>
                <span className="shrink-0 text-[11px] text-slate-500 transition group-hover:text-aurora-300">Changer</span>
              </button>
            ) : (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => setEditing(i)}
                disabled={showcase.candidates.length === 0}
                className="flex min-h-[64px] items-center justify-center rounded-2xl border border-dashed border-white/[0.16] p-3 text-xs text-slate-400 transition hover:border-aurora-400/40 hover:text-white disabled:cursor-default disabled:hover:border-white/[0.16] disabled:hover:text-slate-400"
              >
                {showcase.candidates.length === 0 ? "Gagnez un premier badge pour le montrer ici" : "Choisir un badge"}
              </button>
            )
          )}
        </div>
      )}
      {editing === null && showcase.candidates.length > 0 && showcase.selected.length > 0 && (
        <button type="button" onClick={() => setEditing(-1)} className="text-xs font-medium text-aurora-300 transition hover:text-white">
          Modifier ma vitrine
        </button>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Vos récompenses</p>
          {owned.length === 0 ? (
            <p className="text-xs text-slate-400">Pas encore de récompense : la première arrive avec 10 publications ou le rang Apprenti.</p>
          ) : (
            <ul className="space-y-1.5">
              {owned.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-white">{r.label}</span>
                  <Link href={r.href} className="shrink-0 text-xs font-medium text-aurora-300 hover:text-white">
                    {r.kind === "frame" ? "Page bio →" : "Paramètres →"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">À gagner</p>
          {locked.length === 0 ? (
            <p className="text-xs text-slate-400">Toutes les récompenses sont à vous. Bravo !</p>
          ) : (
            <ul className="space-y-1.5">
              {locked.map((r) => (
                <li key={r.key} className="text-sm">
                  <span className="text-slate-200">{r.label}</span>
                  {r.how && <span className="block text-[11px] text-slate-500">Avec : {r.how}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
      )}
      <CreatorCardDialog open={cardOpen} onClose={() => setCardOpen(false)} />
    </section>
  );
}
