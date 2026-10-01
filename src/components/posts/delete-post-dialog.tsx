"use client";

// Fenêtre « Supprimer cette publication ? » de la fiche d'une publication
// (01/10/2026). Avant : la publication était retirée de Nebula seulement et
// restait en ligne sur les réseaux, sans que la fenêtre le dise. Maintenant,
// pour chaque réseau où elle est en ligne :
//  - une case « Supprimer aussi sur … » quand le réseau le permet à Nebula
//    (décochée par défaut : une suppression sur un réseau est définitive) ;
//  - sinon, la marche à suivre et le lien de la publication.
// Si un réseau échoue, la publication reste dans Nebula et la fenêtre
// détaille chaque réseau (réessayer, lien pour le faire à la main, ou
// supprimer de Nebula seulement).
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NetworkLogo } from "@/components/ui/network-badge";
import { NETWORK_META, type Network } from "@/lib/types";
import { removedFromNetworkAt, type RemoteDeleteSupport } from "@/lib/social/remote-delete-support";

export interface DeletableTarget {
  id: string;
  network: Network;
  status: string;
  externalUrl?: string | null;
  metadata?: unknown;
  connection: { displayName: string };
  /** Calculé par /api/posts/[id] pour une publication en ligne, sinon null. */
  remoteDelete?: RemoteDeleteSupport | null;
}

interface RemoteDeleteResult {
  targetId: string;
  network: string;
  ok: boolean;
  alreadyGone?: boolean;
  error?: string;
  manualUrl?: string | null;
}

const label = (network: string) => NETWORK_META[network as Network]?.label ?? network;

/** Libellé du bouton de suppression selon les cases cochées. */
export function deleteButtonLabel(networks: string[]): string {
  if (networks.length === 0) return "Supprimer de Nebula";
  if (networks.length === 1) return `Supprimer de Nebula et de ${label(networks[0])}`;
  return `Supprimer de Nebula et de ${networks.length} réseaux`;
}

/** Résumé affiché après une suppression complète. */
export function deleteSuccessMessage(results: { network: string; ok: boolean }[]): string {
  const names = Array.from(new Set(results.filter((r) => r.ok).map((r) => label(r.network))));
  if (names.length === 0) return "Publication supprimée de Nebula.";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  return `Publication supprimée de Nebula et de ${list}.`;
}

export function DeletePostDialog({
  postId,
  targets,
  onClose,
  onDeleted,
  onChanged
}: {
  postId: string;
  targets: DeletableTarget[];
  onClose: () => void;
  /** Publication supprimée de Nebula (message de confirmation fourni). */
  onDeleted: (message: string) => void;
  /** Suppression partielle : recharger la fiche (cibles déjà retirées). */
  onChanged: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const online = targets.filter((t) => t.remoteDelete);
  const viaApi = online.filter((t) => t.remoteDelete?.mode === "api");
  const manual = online.filter((t) => t.remoteDelete?.mode === "manual");
  const alreadyRemoved = targets.filter((t) => removedFromNetworkAt(t.metadata));

  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RemoteDeleteResult[] | null>(null);
  // Bouton qui a ouvert la fenêtre, lu AVANT que « Annuler » prenne le focus :
  // le focus y revient à la fermeture (clavier).
  const [opener] = useState(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  useEffect(() => () => opener?.focus?.(), [opener]);

  // Le focus sur le bouton du bas fait défiler la fenêtre (petit écran) : on
  // revient en haut pour que le titre reste visible.
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [results]);

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

  function toggle(id: string, on: boolean) {
    setChecked((prev) => (on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  }

  async function submit(ids: string[]) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/posts/${postId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alsoDeleteOn: ids })
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { deleted?: boolean; results?: RemoteDeleteResult[]; error?: string } | null;
    setBusy(false);
    if (!res || !res.ok || !data) {
      setError(data?.error ?? "Suppression impossible pour le moment. Réessayez dans un instant.");
      return;
    }
    if (data.deleted) {
      // Réseaux retirés lors d'un essai précédent compris dans le message.
      const earlier = (results ?? []).filter((r) => r.ok);
      onDeleted(deleteSuccessMessage([...earlier, ...(data.results ?? [])]));
      return;
    }
    // Échec partiel : on garde les réussites des essais précédents.
    const merged = new Map((results ?? []).map((r) => [r.targetId, r]));
    for (const r of data.results ?? []) merged.set(r.targetId, r);
    setResults(Array.from(merged.values()));
    onChanged();
  }

  const failed = (results ?? []).filter((r) => !r.ok);
  const retryable = failed.filter((r) => viaApi.some((t) => t.id === r.targetId)).map((r) => r.targetId);

  // Portail vers <body> : aucun parent animé (transform) ne décale la fenêtre.
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        ref={panel}
        className="glass-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5"
      >
        {results === null ? (
          <>
            <h3 id={titleId} className="font-display text-base font-medium text-white">
              Supprimer cette publication ?
            </h3>
            <p id={textId} className="mt-1 text-sm text-slate-300">
              Elle sera retirée de Nebula, avec son historique et sa discussion.
              {online.length > 0 && " Sur les réseaux, elle reste en ligne sauf si vous cochez la case du réseau."}
            </p>

            {online.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Déjà en ligne sur</p>
                {viaApi.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 transition hover:border-white/15"
                  >
                    <input
                      type="checkbox"
                      checked={checked.includes(t.id)}
                      onChange={(e) => toggle(t.id, e.target.checked)}
                      disabled={busy}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
                    />
                    <NetworkLogo network={t.network} className="mt-px h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white">Supprimer aussi sur {label(t.network)}</span>
                      <span className="block truncate text-xs text-slate-500">{t.connection.displayName}</span>
                    </span>
                    {t.externalUrl && (
                      <a href={t.externalUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-aurora-300 underline" onClick={(e) => e.stopPropagation()}>
                        Voir
                      </a>
                    )}
                  </label>
                ))}
                {manual.map((t) => {
                  const m = t.remoteDelete as Extract<RemoteDeleteSupport, { mode: "manual" }>;
                  return (
                    <div key={t.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                      <NetworkLogo network={t.network} className="mt-px h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white">
                          {label(t.network)} <span className="text-xs text-slate-500">· {t.connection.displayName}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">{m.how}</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {m.manageUrl && (
                            <a href={m.manageUrl} target="_blank" rel="noreferrer" className="text-aurora-300 underline">
                              {t.network === "YOUTUBE" ? "Ouvrir dans YouTube Studio" : "Ouvrir la publication"}
                            </a>
                          )}
                          {m.reconnect && (
                            <Link href="/accounts" className="text-aurora-300 underline">
                              Reconnecter le compte
                            </Link>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {viaApi.length > 0 && (
                  <p className="text-xs text-slate-500">Une suppression sur un réseau est définitive : mentions J&apos;aime, commentaires et vues compris.</p>
                )}
              </div>
            )}

            {alreadyRemoved.length > 0 && (
              <p className="mt-3 text-xs text-emerald-300">
                Déjà retirée depuis Nebula : {alreadyRemoved.map((t) => label(t.network)).join(", ")}.
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
              <Button variant="danger" onClick={() => submit(checked)} disabled={busy}>
                {busy ? "Suppression…" : deleteButtonLabel(viaApi.filter((t) => checked.includes(t.id)).map((t) => t.network))}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 id={titleId} className="font-display text-base font-medium text-white">
              Suppression incomplète
            </h3>
            <p id={textId} className="mt-1 text-sm text-slate-300">
              La publication est conservée dans Nebula : réessayez, supprimez-la à la main sur le réseau, ou retirez-la de Nebula seulement.
            </p>
            <ul className="mt-4 space-y-2" aria-label="Résultat par réseau">
              {results.map((r) => {
                const target = targets.find((t) => t.id === r.targetId);
                const network = (target?.network ?? r.network) as Network;
                return (
                  <li
                    key={r.targetId}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${r.ok ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-red-500/25 bg-red-500/[0.06]"}`}
                  >
                    <span aria-hidden="true" className={`mt-px text-sm ${r.ok ? "text-emerald-300" : "text-red-300"}`}>
                      {r.ok ? "✓" : "✕"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm text-white">
                        <NetworkLogo network={network} className="h-3.5 w-3.5" />
                        {r.ok ? (r.alreadyGone ? `Déjà absente de ${label(network)}` : `Retirée de ${label(network)}`) : `${label(network)} : non supprimée`}
                      </p>
                      {r.error && <p className="mt-0.5 text-xs text-slate-300">{r.error}</p>}
                      {r.manualUrl && (!r.ok || r.alreadyGone) && (
                        <a href={r.manualUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-aurora-300 underline">
                          {r.ok ? "Vérifier sur le réseau" : "Ouvrir la publication"}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {error && (
              <p role="alert" className="mt-3 text-xs text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus>
                Fermer
              </Button>
              <Button variant="outline" onClick={() => submit([])} disabled={busy}>
                Supprimer de Nebula seulement
              </Button>
              {retryable.length > 0 && (
                <Button variant="danger" onClick={() => submit(retryable)} disabled={busy}>
                  {busy ? "Suppression…" : "Réessayer"}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
