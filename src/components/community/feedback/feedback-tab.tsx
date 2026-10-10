"use client";

// Onglet « Avis » de la Communauté (02/10/2026) : demandes à voter, mes
// demandes, terminées ; bouton « Demander un avis ».
import { useCallback, useEffect, useState } from "react";
import { FilterChip } from "@/components/ui/filter-chip";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/dashboard/toast";
import { FeedbackCard } from "./feedback-card";
import { FeedbackRequestDialog } from "./feedback-request-dialog";
import type { FeedbackQuotaDTO, FeedbackRequestDTO } from "@/lib/community/feedback-rules";

type Scope = "open" | "mine" | "closed";
const SCOPES: { id: Scope; label: string }[] = [
  { id: "open", label: "À voter" },
  { id: "mine", label: "Mes demandes" },
  { id: "closed", label: "Terminées" }
];

export function FeedbackTab({ viewerId, onCountChange }: { viewerId: string | null; onCountChange?: (openCount: number) => void }) {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>("open");
  const [requests, setRequests] = useState<FeedbackRequestDTO[] | null>(null);
  const [quota, setQuota] = useState<FeedbackQuotaDTO | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (s: Scope) => {
    setRequests(null);
    setError(null);
    const res = await fetch(`/api/community/feedback?scope=${s}`, { cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { requests?: FeedbackRequestDTO[]; quota?: FeedbackQuotaDTO; viewer?: { canModerate?: boolean; reported?: string[] } } | null;
    if (!res?.ok || !data?.requests) {
      setError("Impossible de charger les demandes d'avis. Réessayez dans un instant.");
      setRequests([]);
      return;
    }
    setRequests(data.requests);
    setQuota(data.quota ?? null);
    setCanModerate(Boolean(data.viewer?.canModerate));
    setReported(new Set(data.viewer?.reported ?? []));
    if (s === "open") onCountChange?.(data.requests.filter((r) => r.myHearts.length === 0).length);
  }, [onCountChange]);

  useEffect(() => {
    void load(scope);
  }, [load, scope]);

  // Lien direct vers une demande (#avis-…, depuis une notification).
  useEffect(() => {
    if (!requests || !window.location.hash.startsWith("#avis-")) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) el.scrollIntoView({ block: "center" });
    else if (scope === "open") setScope("mine");
  }, [requests, scope]);

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Demandes d'avis">
          {SCOPES.map((s) => (
            <FilterChip key={s.id} active={scope === s.id} onClick={() => setScope(s.id)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {quota && quota.period === "week" && left !== null && (
            <span className="text-[11px] text-slate-500">
              {left} demande{left > 1 ? "s" : ""} restante{left > 1 ? "s" : ""} cette semaine
            </span>
          )}
          <Button onClick={() => setCreating(true)}>Demander un avis</Button>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Une miniature ou un titre à trancher avant de publier ? Proposez 2 ou 3 versions : les autres créateurs votent et donnent leur avis pendant 72&nbsp;h. Aider les autres compte pour l&apos;étoile « Coup de main » de Réussites.
      </p>

      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}

      {requests === null ? (
        <div className="space-y-3" aria-busy="true">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <span className="sr-only">Chargement des demandes d&apos;avis</span>
        </div>
      ) : requests.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {scope === "open"
            ? "Aucune demande à voter pour l'instant. Lancez la vôtre !"
            : scope === "mine"
              ? "Vous n'avez pas encore demandé d'avis."
              : "Aucune demande terminée ces 30 derniers jours."}
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <FeedbackCard
              key={r.id}
              request={r}
              viewerId={viewerId}
              canModerate={canModerate}
              reported={reported}
              onReported={(k) => setReported((prev) => new Set(prev).add(k))}
              onChange={(next) => setRequests((prev) => (prev ?? []).map((x) => (x.id === next.id ? next : x)))}
              onDeleted={() => setRequests((prev) => (prev ?? []).filter((x) => x.id !== r.id))}
            />
          ))}
        </div>
      )}

      <FeedbackRequestDialog
        open={creating}
        quota={quota}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          toast.success("Demande publiée : les avis arrivent dans les 72\u00a0h.");
          if (scope === "mine") void load("mine");
          else setScope("mine");
        }}
      />
    </div>
  );
}
