"use client";

// Vitrine du créateur (Réussites v2, lot B) : 3 badges gagnés, choisis par
// le créateur (visibles à côté de son nom dans la Communauté et sur sa carte
// de créateur), ses récompenses (où les utiliser, comment gagner les
// autres) et sa carte de créateur, une image à télécharger ou partager.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { ReussitesPageDTO, ShowcaseDTO } from "@/lib/reussites/types";
import { clsx } from "@/lib/clsx";

const CARD_URL = "/api/reussites/card";

function CreatorCardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let url: string | null = null;
    setError(null);
    fetch(CARD_URL, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Carte indisponible pour le moment.");
        return res.blob();
      })
      .then((b) => {
        if (!alive) return;
        url = URL.createObjectURL(b);
        setBlob(b);
        setSrc(url);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
      setBlob(null);
    };
  }, [open]);

  const file = blob ? new File([blob], "carte-createur-nebula.png", { type: "image/png" }) : null;
  const canShare = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));

  return (
    <Modal open={open} onClose={onClose} title="Ma carte de créateur" maxWidthClassName="max-w-md">
      <div className="space-y-3">
        <p className="-mt-2 text-xs text-slate-400">Une image rien que pour vous : partagez-la où vous voulez (story, profil). Aucune page publique n&apos;est créée.</p>
        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">{error}</p>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Carte de créateur : rang, constellation, série et vitrine" className="w-full rounded-2xl border border-white/10" />
        ) : (
          <div className="aspect-[4/5] w-full animate-pulse rounded-2xl bg-white/[0.05]" aria-busy="true" />
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={src ?? CARD_URL}
            download="carte-createur-nebula.png"
            className={clsx("flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-nebula-500 px-4 text-sm font-semibold text-white transition hover:bg-nebula-400", !src && "pointer-events-none opacity-60")}
          >
            Télécharger l&apos;image
          </a>
          {canShare && file && (
            <button
              type="button"
              onClick={() => navigator.share({ files: [file], title: "Ma carte de créateur Nebula" }).catch(() => undefined)}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
            >
              Partager
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ShowcasePicker({ showcase, busy, onSave, onCancel }: { showcase: ShowcaseDTO; busy: boolean; onSave: (keys: string[]) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<string[]>(showcase.selected.map((b) => b.key));
  const toggle = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= showcase.max ? prev : [...prev, key]));
  return (
    <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-sm text-slate-300">
        Choisissez jusqu&apos;à {showcase.max} badges ({picked.length} / {showcase.max}).
      </p>
      <div className="nb-thin-scroll grid max-h-72 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" role="group" aria-label="Badges gagnés">
        {showcase.candidates.map((b) => {
          const on = picked.includes(b.key);
          const full = !on && picked.length >= showcase.max;
          return (
            <button
              key={b.key}
              type="button"
              aria-pressed={on}
              disabled={full || busy}
              onClick={() => toggle(b.key)}
              className={clsx(
                "flex min-h-[40px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition",
                on ? "border-aurora-400/60 bg-aurora-400/[0.12] font-semibold text-white" : full ? "cursor-not-allowed border-white/[0.05] text-slate-500" : "border-white/[0.1] text-slate-300 hover:border-aurora-400/40"
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
          onClick={() => onSave(picked)}
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
  highlight
}: {
  showcase: ShowcaseDTO;
  rewards: ReussitesPageDTO["rewards"];
  busy: boolean;
  onSave: (keys: string[]) => Promise<boolean>;
  highlight: boolean;
}) {
  const [editing, setEditing] = useState(false);
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
        <button
          type="button"
          onClick={() => setCardOpen(true)}
          className="min-h-[40px] rounded-xl border border-aurora-400/40 bg-aurora-500/[0.08] px-3.5 text-sm font-medium text-aurora-200 transition hover:bg-aurora-500/[0.16]"
        >
          Ma carte de créateur
        </button>
      </div>

      {editing ? (
        <ShowcasePicker
          showcase={showcase}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (keys) => {
            if (await onSave(keys)) setEditing(false);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {slots.map((b, i) =>
            b ? (
              <div key={b.key} className="flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-xl" aria-hidden="true">
                  {b.emoji}
                </span>
                <span className="min-w-0 text-sm font-medium text-white">{b.label}</span>
              </div>
            ) : (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => setEditing(true)}
                disabled={showcase.candidates.length === 0}
                className="flex min-h-[64px] items-center justify-center rounded-2xl border border-dashed border-white/[0.16] p-3 text-xs text-slate-400 transition hover:border-aurora-400/40 hover:text-white disabled:cursor-default disabled:hover:border-white/[0.16] disabled:hover:text-slate-400"
              >
                {showcase.candidates.length === 0 ? "Gagnez un premier badge pour le montrer ici" : "Choisir un badge"}
              </button>
            )
          )}
        </div>
      )}
      {!editing && showcase.candidates.length > 0 && showcase.selected.length > 0 && (
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-aurora-300 transition hover:text-white">
          Modifier ma vitrine
        </button>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Vos récompenses</p>
          {owned.length === 0 ? (
            <p className="text-xs text-slate-400">Pas encore de récompense : la première arrive avec 10 publications ou le rang Comète.</p>
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
      <CreatorCardDialog open={cardOpen} onClose={() => setCardOpen(false)} />
    </section>
  );
}
