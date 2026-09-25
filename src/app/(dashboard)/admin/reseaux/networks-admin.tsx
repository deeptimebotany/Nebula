"use client";

// Interrupteurs par réseau (lot 5, résilience des API) : suspendre la
// publication ou la synchro d'un réseau sans redéployer (incident chez le
// réseau, changement d'API en cours de correction…), voir l'état du
// disjoncteur automatique et les publications en attente.
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { NetworkBadge } from "@/components/ui/network-badge";
import { useToast } from "@/components/dashboard/toast";
import { LAUNCHED_NETWORKS, NETWORK_META, type Network } from "@/lib/types";

interface Control {
  network: Network;
  publishEnabled: boolean;
  syncEnabled: boolean;
  message: string | null;
  failureCount: number;
  trippedUntil: string | null;
  lastFailureAt: string | null;
  lastFailureCategory: string | null;
  lastFailureMessage: string | null;
  lastSuccessAt: string | null;
}

interface Waiting {
  network: string;
  category: string | null;
  count: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  AUTH_EXPIRED: "connexion expirée",
  PERMISSION_MISSING: "autorisation manquante",
  RATE_LIMITED: "limite de débit",
  QUOTA_EXHAUSTED: "limite quotidienne",
  INVALID_MEDIA: "média refusé",
  INVALID_REQUEST: "contenu refusé",
  VERSION_SUNSET: "version d'API retirée",
  TRANSIENT: "panne passagère",
  TIMEOUT: "délai dépassé",
  // Lot 7 : réponse hors contrat (champ disparu, type changé) — souvent un
  // changement d'API ; la forme reçue est dans les journaux (« [contrat] »).
  UNEXPECTED_RESPONSE: "réponse inattendue",
  VERIFY: "vérification en cours",
  INTERRUPTED: "envoi interrompu",
  PAUSED: "réseau suspendu",
  UNKNOWN: "erreur inconnue"
};

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NetworksAdmin() {
  const [controls, setControls] = useState<Control[] | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/network-controls", { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setControls(d.controls);
    setWaiting(d.waiting ?? []);
    setNow(Date.parse(d.now) || Date.now());
    setDrafts(Object.fromEntries((d.controls as Control[]).map((c) => [c.network, c.message ?? ""])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(network: Network, body: Record<string, unknown>, success: string) {
    setBusy(network);
    try {
      const res = await fetch("/api/admin/network-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, ...body })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Modification impossible.");
      toast.success(d.woken ? `${success} ${d.woken} publication(s) en attente vont repartir.` : success);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const ordered = controls
    ? [...controls].sort((a, b) => Number(LAUNCHED_NETWORKS.includes(b.network)) - Number(LAUNCHED_NETWORKS.includes(a.network)))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Réseaux"
        description="Suspendre la publication ou la synchro d'un réseau sans redéployer, et suivre le disjoncteur automatique. Les publications suspendues attendent (24 h au plus) et repartent seules à la reprise."
      />
      {!controls ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ordered.map((c) => {
            const label = NETWORK_META[c.network]?.label ?? c.network;
            const tripped = c.trippedUntil !== null && Date.parse(c.trippedUntil) > now;
            const waitingHere = waiting.filter((w) => w.network === c.network);
            const waitingTotal = waitingHere.reduce((s, w) => s + w.count, 0);
            const launched = LAUNCHED_NETWORKS.includes(c.network);
            return (
              <GlassCard key={c.network} hover={false} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <NetworkBadge network={c.network} size="sm" />
                    <h2 className="font-display text-base font-medium text-white">{label}</h2>
                    {!launched && <Badge tone="neutral">pas encore ouvert</Badge>}
                  </div>
                  {tripped ? (
                    <Badge tone="danger">Disjoncteur : reprise à {new Date(c.trippedUntil as string).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Badge>
                  ) : !c.publishEnabled || !c.syncEnabled ? (
                    <Badge tone="warning">Suspendu</Badge>
                  ) : (
                    <Badge tone="success">Normal</Badge>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle
                    checked={c.publishEnabled}
                    disabled={busy === c.network}
                    onChange={(v) => patch(c.network, { publishEnabled: v }, v ? `Publication ${label} réactivée.` : `Publication ${label} suspendue.`)}
                    label="Publication"
                    description="Envois vers ce réseau"
                  />
                  <Toggle
                    checked={c.syncEnabled}
                    disabled={busy === c.network}
                    onChange={(v) => patch(c.network, { syncEnabled: v }, v ? `Synchro ${label} réactivée.` : `Synchro ${label} suspendue.`)}
                    label="Synchro"
                    description="Statistiques, commentaires"
                  />
                </div>

                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void patch(c.network, { message: drafts[c.network] ?? "" }, "Message enregistré.");
                  }}
                >
                  <Input
                    aria-label={`Message affiché aux utilisateurs pendant une suspension de ${label}`}
                    placeholder="Message aux utilisateurs (facultatif)"
                    value={drafts[c.network] ?? ""}
                    maxLength={300}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.network]: e.target.value }))}
                  />
                  <Button type="submit" variant="outline" disabled={busy === c.network || (drafts[c.network] ?? "") === (c.message ?? "")}>
                    Enregistrer
                  </Button>
                </form>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt className="text-slate-500">Pannes récentes</dt>
                  <dd className="text-slate-300">{c.failureCount} (seuil : 5 en 10 min)</dd>
                  <dt className="text-slate-500">Dernier succès</dt>
                  <dd className="text-slate-300">{when(c.lastSuccessAt)}</dd>
                  <dt className="text-slate-500">Dernière erreur</dt>
                  <dd className="text-slate-300">
                    {c.lastFailureAt ? `${when(c.lastFailureAt)} · ${CATEGORY_LABEL[c.lastFailureCategory ?? ""] ?? c.lastFailureCategory}` : "—"}
                  </dd>
                  <dt className="text-slate-500">En attente</dt>
                  <dd className="text-slate-300">
                    {waitingTotal === 0
                      ? "aucune publication"
                      : waitingHere.map((w) => `${w.count} (${CATEGORY_LABEL[w.category ?? ""] ?? "relance"})`).join(", ")}
                  </dd>
                </dl>
                {c.lastFailureMessage && <p className="break-words text-xs text-slate-500">{c.lastFailureMessage}</p>}

                {tripped && (
                  <Button variant="outline" disabled={busy === c.network} onClick={() => patch(c.network, { resetBreaker: true }, `Disjoncteur ${label} réarmé.`)}>
                    Réarmer maintenant
                  </Button>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
