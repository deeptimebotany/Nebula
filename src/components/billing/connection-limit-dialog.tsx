"use client";

// Fenêtre « Trop de comptes connectés » (09/10/2026), ouverte par
// ConnectionLimitGate. Les comptes à déconnecter sont cochés d'avance (ceux
// qui ne sont pas proposés à garder : les comptes choisis dans « Choisir ce
// que je garde », sinon les plus utilisés) ; la personne change la sélection,
// confirme, et les comptes cochés sont déconnectés comme avec le bouton
// « Déconnecter » de la page Comptes. Pas de bouton fermer : seules issues,
// déconnecter les comptes en trop, passer à un palier supérieur (Facturation)
// ou se déconnecter de Nebula.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { signOut } from "next-auth/react";
import { Button, buttonClasses } from "@/components/ui/button";
import { NetworkTile } from "@/components/ui/network-badge";
import { useToast } from "@/components/dashboard/toast";
import { refreshConnections, refreshUsage } from "@/lib/data/hooks";
import { connectionSlotsFor } from "@/lib/connection-slots";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";

interface LimitConnection {
  id: string;
  network: string;
  displayName: string;
  handle: string | null;
  status: string;
  dormant: boolean;
}

interface LimitState {
  slots: number;
  max: number;
  planLabel: string;
  over: boolean;
  connections: LimitConnection[];
  suggestedKeep: string[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Chargement impossible.");
    return r.json() as Promise<LimitState>;
  });

function networkLabel(network: string): string {
  return (NETWORK_META as Record<string, { label: string } | undefined>)[network]?.label ?? network;
}

export function ConnectionLimitDialog({ brandId, brandName }: { brandId: string; brandName: string }) {
  const toast = useToast();
  const key = `/api/billing/connection-limit?brandId=${encodeURIComponent(brandId)}`;
  const { data, error, mutate } = useSWR<LimitState>(key, fetcher, { revalidateOnFocus: true });
  const [toDisconnect, setToDisconnect] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sélection de départ : tout ce qui n'est pas proposé à garder.
  useEffect(() => {
    if (!data || toDisconnect) return;
    setToDisconnect(new Set(data.connections.filter((c) => !data.suggestedKeep.includes(c.id)).map((c) => c.id)));
  }, [data, toDisconnect]);

  const selected = useMemo(() => toDisconnect ?? new Set<string>(), [toDisconnect]);
  const kept = data ? data.connections.filter((c) => !selected.has(c.id)) : [];
  const keptSlots = connectionSlotsFor(kept.map((c) => c.network));
  const fits = data ? keptSlots <= data.max : false;
  const count = selected.size;

  function toggle(id: string) {
    setConfirming(false);
    setToDisconnect((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function disconnect() {
    if (!data || count === 0 || !fits) return;
    setBusy(true);
    const res = await fetch("/api/billing/connection-limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, connectionIds: Array.from(selected) })
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setConfirming(false);
    if (!res || !res.ok) {
      toast.error(typeof body.error === "string" ? body.error : "La déconnexion n'a pas abouti. Réessayez.");
      return;
    }
    toast.success(`${body.disconnected} compte${body.disconnected > 1 ? "s" : ""} déconnecté${body.disconnected > 1 ? "s" : ""}.`);
    setToDisconnect(null);
    if (body.state) await mutate(body.state as LimitState, { revalidate: false });
    // La garde se referme d'elle-même quand la consommation repasse dans la limite.
    await Promise.all([refreshUsage(), refreshConnections(brandId)]);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="connection-limit-title" className="glass-panel-solid my-auto w-full max-w-lg rounded-3xl p-6 sm:p-8">
        <h2 id="connection-limit-title" className="font-display text-xl font-semibold text-white">
          Trop de comptes connectés pour votre palier
        </h2>
        {!data ? (
          <p className="mt-3 text-sm text-slate-400">{error ? "Impossible de charger vos comptes. Rechargez la page." : "Chargement de vos comptes…"}</p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Votre palier {data.planLabel} permet {data.max} comptes par marque, et « {brandName} » en a{" "}
              {data.slots}. Pour continuer à utiliser Nebula, déconnectez les comptes en trop, ou passez à un palier supérieur.
            </p>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Comptes à déconnecter</p>
            <ul className="mt-2 space-y-1.5">
              {data.connections.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={clsx(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                        checked ? "border-red-400/40 bg-red-400/[0.06]" : "border-[color:var(--nb-sep)] hover:bg-[color:var(--nb-hover)]"
                      )}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="h-4 w-4 shrink-0 accent-red-400" aria-label={`Déconnecter ${c.displayName}`} />
                      <NetworkTile network={c.network as Network} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{c.displayName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {networkLabel(c.network)}
                          {c.handle ? ` · ${c.handle}` : ""}
                          {c.dormant ? " · en veille" : c.status !== "CONNECTED" ? " · à reconnecter" : ""}
                        </span>
                      </span>
                      <span className={clsx("shrink-0 text-xs font-medium", checked ? "text-red-300" : "text-emerald-300")}>{checked ? "Déconnecter" : "Garder"}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <p role="status" className={clsx("mt-3 text-sm", fits ? "text-emerald-300" : "text-amber-200")}>
              Comptes gardés : {keptSlots} / {data.max}
              {fits ? "" : " : cochez encore un compte à déconnecter."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Un compte déconnecté ne publie plus et n&apos;est plus synchronisé ; vos publications déjà en ligne ne sont pas touchées. Vous pourrez le
              reconnecter en passant à un palier supérieur.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {confirming ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-400/[0.06] p-4">
                  <p className="text-sm text-red-100">
                    Déconnecter {count} compte{count > 1 ? "s" : ""} ? Nebula n&apos;y aura plus accès.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="danger" onClick={disconnect} disabled={busy}>
                      {busy ? "Déconnexion…" : "Oui, déconnecter"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" onClick={() => setConfirming(true)} disabled={!fits || count === 0}>
                  Déconnecter {count} compte{count > 1 ? "s" : ""}
                </Button>
              )}
              <Link href="/billing" className={buttonClasses("outline")}>
                Passer à un palier supérieur
              </Link>
              <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-slate-400 transition hover:text-white">
                Se déconnecter de Nebula
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
