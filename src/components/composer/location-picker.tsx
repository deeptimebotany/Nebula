"use client";

// Sélecteur « Lieu » du Composer : ajoute un emplacement géographique aux
// publications, sur les réseaux dont l'API le permet (voir
// PublishInput.location dans src/lib/social/base.ts) :
//   - Instagram : location_id (publication automatique par Nebula, compte pro) ;
//   - Facebook : place, sur les publications photo uniquement ;
//   - YouTube : coordonnées du lieu (recordingDetails), si connues ;
//   - TikTok : non pris en charge par son API.
// Pour Meta, un lieu est une Page Facebook dotée d'une adresse. Recherche
// via /api/social/places ; si Meta ne l'autorise pas encore pour Nebula, on
// propose de coller le lien de la Page Facebook du lieu.

import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { InfoTip } from "@/components/ui/info-tip";
import { IconClose } from "@/components/dashboard/icons";
import { NETWORK_META, type Network } from "@/lib/types";

export interface PickedLocation {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

const HELP =
  "Ajoute un lieu à votre publication (ville, commerce, salle, monument…). Instagram : le lieu est ajouté quand Nebula publie lui-même le post, en publication automatique, sur un compte professionnel. Facebook : sur les publications photo uniquement. YouTube : les coordonnées du lieu sont enregistrées avec la vidéo. TikTok ne permet pas encore d'ajouter un lieu depuis une autre application. Pour Instagram et Facebook, un lieu correspond à une Page Facebook qui a une adresse. Si le lieu est refusé au moment de publier, la publication part quand même, sans lieu.";

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

/** Ce que devient le lieu sur chaque réseau sélectionné. */
function coverage(networks: Network[], mediaType: "VIDEO" | "IMAGE" | null, hasCoords: boolean): { ok: string[]; no: string[] } {
  const ok: string[] = [];
  const no: string[] = [];
  for (const n of networks) {
    const label = NETWORK_META[n].label;
    if (n === "INSTAGRAM") ok.push(label);
    else if (n === "FACEBOOK") (mediaType === "VIDEO" ? no : ok).push(mediaType === "VIDEO" ? `${label} (vidéos)` : label);
    else if (n === "YOUTUBE") (hasCoords ? ok : no).push(hasCoords ? label : `${label} (coordonnées inconnues)`);
    else no.push(label);
  }
  return { ok, no };
}

export function LocationPicker({
  brandId,
  value,
  onChange,
  networks,
  mediaType
}: {
  brandId: string | undefined;
  value: PickedLocation | null;
  onChange: (next: PickedLocation | null) => void;
  networks: Network[];
  mediaType: "VIDEO" | "IMAGE" | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pageLink, setPageLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Recherche au fil de la frappe (350 ms après la dernière touche).
  useEffect(() => {
    if (!brandId || value) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/social/places?brandId=${encodeURIComponent(brandId)}&q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        setResults(data.places ?? []);
        setUnavailable(data.unavailable ? data.message ?? "Recherche de lieux indisponible." : null);
        setOpen(true);
      } catch {
        // requête annulée (nouvelle frappe) ou réseau : rien à afficher
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, brandId, value]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function choose(place: PickedLocation) {
    onChange(place);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  async function addFromLink() {
    if (!brandId || !pageLink.trim()) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/social/places?brandId=${encodeURIComponent(brandId)}&page=${encodeURIComponent(pageLink.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.place) throw new Error(data.error ?? "Page introuvable.");
      if (data.hasAddress === false) throw new Error("Cette Page Facebook n'a pas d'adresse : Instagram et Facebook ne l'accepteront pas comme lieu.");
      choose(data.place);
      setPageLink("");
    } catch (err) {
      setLinkError((err as Error).message);
    } finally {
      setLinkLoading(false);
    }
  }

  const hasCoords = typeof value?.latitude === "number" && typeof value?.longitude === "number";
  const cov = coverage(networks, mediaType, value ? hasCoords : true);

  return (
    <div ref={boxRef} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <PinIcon className="h-3.5 w-3.5 text-aurora-300" />
        Lieu <span className="text-slate-600">(optionnel)</span>
        <InfoTip label="Comment fonctionne l'ajout d'un lieu ?">{HELP}</InfoTip>
      </div>

      {value ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-aurora-400/30 bg-aurora-400/[0.06] px-3 py-2">
          <PinIcon className="h-4 w-4 shrink-0 text-aurora-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{value.name}</p>
            {value.address && <p className="truncate text-[11px] text-slate-400">{value.address}</p>}
          </div>
          <button type="button" onClick={() => onChange(null)} aria-label="Retirer le lieu" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-white">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative mt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Rechercher un lieu (ex. Tour Eiffel, Café des Arts Lyon…)"
            aria-label="Rechercher un lieu"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-aurora-400/60"
          />
          {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">Recherche…</span>}
          {open && !unavailable && query.trim().length >= 2 && !loading && (
            <div className="glass-panel-solid absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-lg p-1">
              {results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">Aucun lieu trouvé. Essayez avec la ville, ou collez le lien de sa Page Facebook ci-dessous.</p>
              ) : (
                results.map((r) => (
                  <button key={r.id} type="button" onClick={() => choose(r)} className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition hover:bg-white/5">
                    <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-white">{r.name}</span>
                      {r.address && <span className="block truncate text-[11px] text-slate-500">{r.address}</span>}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          {unavailable && <p className="mt-2 text-[11px] leading-relaxed text-amber-300/90">{unavailable}</p>}

          <details className="group mt-2" open={Boolean(unavailable)}>
            <summary className="cursor-pointer list-none text-[11px] text-slate-500 transition hover:text-slate-300">
              <span className="group-open:hidden">▸</span>
              <span className="hidden group-open:inline">▾</span> Vous avez le lien de la Page Facebook du lieu ?
            </summary>
            <div className="mt-1.5 flex gap-2">
              <input
                value={pageLink}
                onChange={(e) => setPageLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFromLink()}
                placeholder="https://www.facebook.com/…"
                aria-label="Lien de la Page Facebook du lieu"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white outline-none focus:border-aurora-400/60"
              />
              <button
                type="button"
                onClick={addFromLink}
                disabled={linkLoading || !pageLink.trim()}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white transition hover:border-aurora-400/50 disabled:opacity-50"
              >
                {linkLoading ? "…" : "Ajouter"}
              </button>
            </div>
            {linkError && <p className="mt-1 text-[11px] text-red-300">{linkError}</p>}
          </details>
        </div>
      )}

      {networks.length > 0 && (value || query) && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {cov.ok.length > 0 && (
            <>
              Ajouté sur : <span className="text-slate-300">{cov.ok.join(", ")}</span>
            </>
          )}
          {cov.no.length > 0 && (
            <span className={clsx(cov.ok.length > 0 && "ml-1")}>
              {cov.ok.length > 0 ? "· " : ""}Non pris en charge : {cov.no.join(", ")}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
