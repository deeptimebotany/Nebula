"use client";

// Vidéo à la une, côté créateur (Réussites v2, lot C) : accord (retirable à
// tout moment), tickets gagnés (rang Constellation I, coffre), choix de la
// vidéo parmi celles déjà partagées dans la Communauté, et ses mises à la
// une en cours ou à venir (qu'il peut retirer).
import Link from "next/link";
import { useEffect, useState } from "react";
import { NETWORK_META, type Network } from "@/lib/types";
import type { FeaturedDTO } from "@/lib/reussites/types";
import { clsx } from "@/lib/clsx";

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

export function FeaturedPanel({
  featured,
  busy,
  error,
  onConsent,
  onUse,
  onRemove
}: {
  featured: FeaturedDTO;
  busy: boolean;
  /** Erreur de la dernière action, affichée dans le panneau (pas en haut de page). */
  error?: string | null;
  onConsent: (consent: boolean) => void;
  onUse: (sharedVideoId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  // La case suit le clic tout de suite ; revient à la valeur enregistrée
  // quand la requête se termine (succès : nouvelle valeur ; échec : ancienne).
  const [draft, setDraft] = useState<boolean | null>(null);
  useEffect(() => {
    if (!busy) setDraft(null);
  }, [busy]);
  const consent = draft ?? featured.consent;
  const available = featured.shared.filter((v) => !v.featured);
  return (
    <div className="space-y-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">Vidéo à la une</p>
          <p className="mt-1 text-sm text-slate-300">
            3 vidéos à la une de la Communauté, 7 jours chacune. Gagnée au rang Constellation ou, rarement, dans le coffre.
          </p>
        </div>
        <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-200">
          {featured.tickets} ticket{featured.tickets > 1 ? "s" : ""}
        </span>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(e) => {
            setDraft(e.target.checked);
            onConsent(e.target.checked);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#8646ff]"
        />
        <span>
          J&apos;accepte que mes vidéos partagées dans la Communauté puissent être mises à la une (un lien vers la vidéo, jamais une copie).
          <span className="block text-[11px] text-slate-500">Retirable à tout moment : décocher retire aussi vos vidéos à la une. Nebula peut retirer une vidéo.</span>
        </span>
      </label>

      {featured.mine.length > 0 && (
        <ul className="space-y-1.5">
          {featured.mine.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-sm">
              <span className="min-w-0">
                <a href={f.externalUrl} target="_blank" rel="noreferrer" className="block truncate text-white hover:underline">
                  {f.title}
                </a>
                <span className="text-[11px] text-slate-400">
                  {f.live ? `À la une jusqu'au ${day(f.endsAt)}` : `En attente d'une place : du ${day(f.startsAt)} au ${day(f.endsAt)}`} · {NETWORK_META[f.network as Network]?.label ?? f.network}
                </span>
              </span>
              <button type="button" disabled={busy} onClick={() => onRemove(f.id)} className="text-xs text-slate-400 transition hover:text-red-300 disabled:opacity-50">
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {featured.tickets > 0 &&
        (!consent ? (
          <p className="text-xs text-amber-200">Cochez l&apos;accord ci-dessus pour utiliser votre ticket.</p>
        ) : available.length === 0 ? (
          <p className="text-xs text-slate-300">
            Partagez d&apos;abord une vidéo déjà en ligne avec la Communauté (bouton « Partager avec la communauté » sur la fiche d&apos;une publication), puis revenez ici.{" "}
            <Link href="/publications" className="text-aurora-300 hover:text-white">
              Mes publications →
            </Link>
          </p>
        ) : picking ? (
          <div className="space-y-1.5" role="group" aria-label="Choisir la vidéo à mettre à la une">
            {available.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  onUse(v.id);
                  setPicking(false);
                }}
                className={clsx("flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl border border-white/[0.1] px-3 py-2 text-left text-sm text-slate-200 transition hover:border-amber-300/50 disabled:opacity-60")}
              >
                <span className="min-w-0 truncate">{v.title}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{NETWORK_META[v.network as Network]?.label ?? v.network}</span>
              </button>
            ))}
            <button type="button" onClick={() => setPicking(false)} className="text-xs text-slate-400 hover:text-white">
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="min-h-[40px] rounded-xl border border-amber-300/50 bg-amber-300/[0.1] px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/[0.18]"
          >
            Choisir ma vidéo à la une
          </button>
        ))}

      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
