"use client";

// Fenêtre « Supprimer N publications ? » de la page Publications (10/10/2026,
// retour de Lucas : la phrase qui renvoyait à la corbeille de chaque ligne
// pour retirer une publication d'un réseau ne voulait rien dire). Comme la corbeille d'une
// seule publication (delete-post-dialog.tsx), la fenêtre dit clairement ce
// qui se passe et propose, pour chaque réseau où des publications cochées
// sont en ligne :
//  - une case « Supprimer aussi sur … » quand le réseau le permet à Nebula
//    (décochée par défaut : une suppression sur un réseau est définitive) ;
//  - sinon, pourquoi elles resteront en ligne et comment les retirer.
// Si un réseau échoue, les publications concernées restent dans Nebula et
// la fenêtre les liste (réessayer, ou supprimer de Nebula seulement).
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkLogo } from "@/components/ui/network-badge";
import { NETWORK_META, type Network } from "@/lib/types";
import { bulkDeleteMessage, bulkUnit, type BulkNetworkSummary } from "@/lib/posts/bulk-delete";
import { deleteButtonLabel } from "./delete-post-dialog";

interface Preview {
  total: number;
  publishing: number;
  networks: BulkNetworkSummary[];
}

interface KeptPost {
  id: string;
  title: string;
  failures: { network: string; error: string; manualUrl: string | null }[];
}

const label = (network: string) => NETWORK_META[network as Network]?.label ?? network;

/** Ce qui se passe sur les réseaux, en une phrase. */
export function onlineSentence(many: boolean, online: number, canDelete: boolean): string {
  if (online === 0) return many ? "Aucune n'est en ligne sur un réseau : rien ne change sur vos comptes." : "Elle n'est en ligne sur aucun réseau : rien ne change sur vos comptes.";
  const stays = many ? "Celles qui sont déjà en ligne restent sur les réseaux" : "Elle reste en ligne sur les réseaux";
  return canDelete ? `${stays}, sauf si vous cochez le réseau ci-dessous.` : `${stays} (voir ci-dessous).`;
}

export function BulkDeleteDialog({
  ids,
  onClose,
  onDone
}: {
  ids: string[];
  onClose: () => void;
  /** Suppression faite (même partielle) : message à afficher, liste à recharger. */
  onDone: (message: string, info?: { publishing: number }) => void;
}) {
  const titleId = useId();
  const textId = useId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<KeptPost[] | null>(null);
  const [deletedSoFar, setDeletedSoFar] = useState(0);
  const [opener] = useState(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  useEffect(() => () => opener?.focus?.(), [opener]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/posts/bulk-delete/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Preview | null) => {
        if (cancelled) return;
        if (d) setPreview(d);
        else setLoadError(true);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  // Échap = Annuler (jamais pendant une suppression en cours).
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busyRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function submit(postIds: string[], networks: string[]) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/posts/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: postIds, alsoDeleteOn: networks })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { deleted?: number; removedOn?: Record<string, number>; kept?: KeptPost[]; publishing?: number; error?: string } | null;
    setBusy(false);
    if (!res || !res.ok || !data) {
      setError(data?.error ?? "La suppression n'a pas abouti. Réessayez dans un instant.");
      return;
    }
    const total = deletedSoFar + (data.deleted ?? 0);
    if (!data.kept || data.kept.length === 0) {
      onDone(bulkDeleteMessage(total, data.removedOn ?? {}), { publishing: data.publishing ?? 0 });
      return;
    }
    setDeletedSoFar(total);
    setKept(data.kept);
  }

  const n = ids.length;
  const many = n > 1;
  const networks = preview?.networks ?? [];
  const viaApi = networks.filter((r) => r.viaApi > 0);
  const onlineCount = networks.reduce((s, r) => s + r.viaApi + r.manual, 0);
  const keptIds = (kept ?? []).map((k) => k.id);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-testid="bulk-delete-dialog"
        className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5"
      >
        {kept === null ? (
          <>
            <h3 id={titleId} className="font-display text-base font-semibold text-white">
              {many ? `Supprimer ${n} publications ?` : "Supprimer cette publication ?"}
            </h3>
            <p id={textId} className="mt-1 text-sm text-slate-300">
              {many ? "Elles seront supprimées" : "Elle sera supprimée"} de Nebula, avec {many ? "leurs" : "ses"} statistiques et {many ? "leurs" : "ses"} fichiers.
              {preview && " " + onlineSentence(many, onlineCount, viaApi.length > 0)}
            </p>

            {!preview && !loadError && (
              <div className="mt-4 space-y-2" aria-busy="true">
                <p className="text-xs text-slate-500">Vérification des publications déjà en ligne…</p>
                <Skeleton className="h-11 w-full" />
              </div>
            )}
            {loadError && <p className="mt-3 text-xs text-amber-300">Impossible de vérifier les réseaux pour le moment : la suppression se fera dans Nebula seulement.</p>}

            {onlineCount > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[12px] font-semibold text-slate-400">Déjà en ligne sur</p>
                {networks.map((row) => (
                  <div key={row.network} className="space-y-2">
                    {row.viaApi > 0 && (
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/15">
                        <input
                          type="checkbox"
                          checked={checked.includes(row.network)}
                          onChange={(e) => setChecked((prev) => (e.target.checked ? [...prev, row.network] : prev.filter((x) => x !== row.network)))}
                          disabled={busy}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
                        />
                        <NetworkLogo network={row.network as Network} className="mt-px h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white">Supprimer aussi sur {label(row.network)}</span>
                          <span className="block text-xs text-slate-500">{bulkUnit(row.network, row.viaApi)} en ligne</span>
                        </span>
                      </label>
                    )}
                    {row.manual > 0 && (
                      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                        <NetworkLogo network={row.network as Network} className="mt-px h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white">
                            {label(row.network)} · {bulkUnit(row.network, row.manual)} {row.manual > 1 ? "resteront" : "restera"} en ligne
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">{row.why}</p>
                          {row.reconnect && (
                            <Link href="/accounts" className="mt-1 inline-block text-xs text-aurora-300 underline">
                              Comptes connectés
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {viaApi.length > 0 && <p className="text-xs text-slate-500">Une suppression sur un réseau est définitive : mentions J&apos;aime, commentaires et vues compris.</p>}
              </div>
            )}

            {preview && preview.publishing > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                {preview.publishing} publication{preview.publishing > 1 ? "s" : ""} en cours d&apos;envoi {preview.publishing > 1 ? "seront laissées" : "sera laissée"} de côté.
              </p>
            )}

            {error && (
              <p role="alert" className="mt-3 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {/* Focus par défaut sur « Annuler » : Entrée ne supprime jamais par mégarde. */}
              <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => submit(ids, checked)} disabled={busy || (!preview && !loadError)}>
                {busy ? "Suppression…" : deleteButtonLabel(checked)}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 id={titleId} className="font-display text-base font-semibold text-white">
              Suppression incomplète
            </h3>
            <p id={textId} className="mt-1 text-sm text-slate-300">
              {deletedSoFar > 0 && `${deletedSoFar} publication${deletedSoFar > 1 ? "s" : ""} supprimée${deletedSoFar > 1 ? "s" : ""}. `}
              {kept.length > 1 ? `${kept.length} publications sont gardées` : "Une publication est gardée"} dans Nebula, car un réseau a refusé la suppression : réessayez, supprimez-les à la main sur le réseau, ou retirez-les de Nebula seulement.
            </p>
            <ul className="mt-4 space-y-2" aria-label="Publications gardées">
              {kept.map((k) => (
                <li key={k.id} className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3">
                  <p className="truncate text-sm text-white">{k.title}</p>
                  {k.failures.map((f, i) => (
                    <p key={i} className="mt-1 flex items-start gap-1.5 text-xs text-slate-300">
                      <NetworkLogo network={f.network as Network} className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>
                        {f.error}{" "}
                        {f.manualUrl && (
                          <a href={f.manualUrl} target="_blank" rel="noreferrer" className="text-aurora-300 underline">
                            Ouvrir la publication
                          </a>
                        )}
                      </span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => onDone(bulkDeleteMessage(deletedSoFar, {}))} disabled={busy} autoFocus>
                Fermer
              </Button>
              <Button variant="outline" onClick={() => submit(keptIds, [])} disabled={busy}>
                Supprimer de Nebula seulement
              </Button>
              <Button variant="danger" onClick={() => submit(keptIds, checked)} disabled={busy}>
                {busy ? "Suppression…" : "Réessayer"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
