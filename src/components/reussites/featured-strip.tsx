"use client";

// « À la une » de la Communauté (Réussites v2, lot C) : 3 vidéos déjà
// partagées par des créateurs qui l'acceptent, 7 jours chacune. Gagnées
// (rang Constellation, coffre), choisies par Nebula, ou « sélection du
// moment » (vidéos partagées récemment) quand une place est libre. Un lien
// vers la vidéo sur son réseau, jamais une copie. Le créateur ou le
// propriétaire du site peut la retirer.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RemoteImage } from "@/components/ui/remote-image";
import { NetworkBadge } from "@/components/ui/network-badge";
import { useToast } from "@/components/dashboard/toast";
import type { Network } from "@/lib/types";

interface FeaturedItem {
  id: string;
  sharedVideoId: string;
  title: string;
  network: Network;
  externalUrl: string;
  thumbnailUrl: string | null;
  author: { id: string; name: string };
  source: "reward" | "admin" | "auto";
  endsAt: string | null;
  canRemove: boolean;
}

const SOURCE_LABEL: Record<FeaturedItem["source"], string> = { reward: "Gagnée dans Réussites", admin: "Choix de Nebula", auto: "Sélection du moment" };

export function FeaturedStrip() {
  const toast = useToast();
  const [items, setItems] = useState<FeaturedItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/community/featured", { cache: "no-store" }).catch(() => null);
    const json = res?.ok ? ((await res.json()) as { featured: FeaturedItem[] }) : { featured: [] };
    setItems(json.featured);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setBusy(id);
    const res = await fetch(`/api/community/featured/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      toast.error("Impossible de retirer cette vidéo pour le moment.");
      return;
    }
    toast.success("Vidéo retirée de la une.");
    await load();
  }

  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="featured-title" className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="featured-title" className="flex items-center gap-2 font-display text-base font-semibold text-white">
          <span className="text-amber-300" aria-hidden="true">
            ★
          </span>
          À la une
        </h2>
        <Link href="/reussites?focus=vitrine" className="text-xs text-aurora-300 transition hover:text-white">
          Mettre ma vidéo à la une →
        </Link>
      </div>
      {/* Mobile : une rangée qui défile (la liste des discussions reste visible juste en dessous). */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
        {items.map((v) => (
          <article key={v.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-amber-300/30 bg-amber-300/[0.04] sm:w-auto">
            <a href={v.externalUrl} target="_blank" rel="noreferrer" className="block">
              <div className="relative aspect-video w-full bg-black/40">
                {v.thumbnailUrl ? (
                  <RemoteImage src={v.thumbnailUrl} className="h-full w-full" sizes="(max-width: 640px) 100vw, 300px" />
                ) : (
                  // Pas de miniature connue : un repère « lecture » plutôt qu'un cadre vide.
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-300/[0.12] via-transparent to-nebula-500/[0.14]">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white" aria-hidden="true">
                      <svg viewBox="0 0 16 16" className="ml-0.5 h-4 w-4">
                        <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                      </svg>
                    </span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-[#fde68a]">{SOURCE_LABEL[v.source]}</span>
              </div>
            </a>
            <div className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <NetworkBadge network={v.network} size="sm" />
                {v.canRemove && (
                  <button type="button" disabled={busy === v.id} onClick={() => remove(v.id)} className="text-[11px] text-slate-400 transition hover:text-red-300 disabled:opacity-50">
                    {busy === v.id ? "Retrait…" : "Retirer"}
                  </button>
                )}
              </div>
              <a href={v.externalUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-white hover:underline">
                {v.title}
              </a>
              <p className="text-[11px] text-slate-500">
                par {v.author.name}
                {v.endsAt && <> · jusqu&apos;au {new Date(v.endsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</>}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
