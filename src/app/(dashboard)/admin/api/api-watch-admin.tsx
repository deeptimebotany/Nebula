"use client";

// Veille des API (02/10/2026) : être prévenu AVANT qu'un changement d'API ne
// casse le site. Quatre onglets : calendrier des échéances (versions et
// modèles utilisés, fin de vie, date de revue), annonces des changelogs
// officiels relus chaque jour, signaux lus dans les vraies réponses des API,
// et sources suivies. Chaque alerte arrive aussi dans la cloche et par
// e-mail (voir src/lib/api-watch).
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/dashboard/toast";
import { clsx } from "@/lib/clsx";
import type { ApiDeadlineDTO, ApiWatchDashboardDTO } from "@/lib/api-watch/types";

type Tab = "calendrier" | "annonces" | "signaux" | "sources";

const LEVEL: Record<ApiDeadlineDTO["next"]["level"], { label: string; tone: BadgeTone }> = {
  ok: { label: "À jour", tone: "success" },
  bientot: { label: "À prévoir", tone: "info" },
  urgent: { label: "Urgent", tone: "warning" },
  depasse: { label: "Dépassée", tone: "danger" }
};

const IMPACT_TONE: Record<string, BadgeTone> = { aucun: "neutral", "à surveiller": "warning", action: "danger" };

const SIGNAL_LABEL: Record<string, string> = {
  DEPRECATION: "Adresse dépréciée",
  SUNSET: "Retrait annoncé",
  VERSION_UPGRADED: "Version dépassée",
  WARNING: "Avertissement"
};

function day(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function when(iso: string | null): string {
  if (!iso) return "jamais";
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function daysText(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days < 0) return `dépassée de ${-days} j`;
  return `dans ${days} j`;
}

export function ApiWatchAdmin() {
  const [data, setData] = useState<ApiWatchDashboardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("calendrier");
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/api-watch", { cache: "no-store" }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as ApiWatchDashboardDTO | null;
    if (!res?.ok || !d) {
      setError("Impossible de charger la veille des API.");
      return;
    }
    setError(null);
    setData(d);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkNow() {
    setBusy("check");
    try {
      const res = await fetch("/api/admin/api-watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check-now" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Vérification impossible.");
      setData(d.dashboard);
      const run = d.run as { checked: string[]; newItems: number; important: number };
      toast.success(`${run.checked.length} source${run.checked.length > 1 ? "s" : ""} relue${run.checked.length > 1 ? "s" : ""} : ${run.newItems} annonce${run.newItems > 1 ? "s" : ""} nouvelle${run.newItems > 1 ? "s" : ""}, dont ${run.important} importante${run.important > 1 ? "s" : ""}.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handle(type: "signal" | "item", id: string, handled: boolean) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/api-watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "handle", type, id, handled }) });
      if (!res.ok) throw new Error("Modification impossible.");
      setData((d) =>
        d
          ? {
              ...d,
              signals: type === "signal" ? d.signals.map((s) => (s.id === id ? { ...s, handled } : s)) : d.signals,
              items: type === "item" ? d.items.map((i) => (i.id === id ? { ...i, handled } : i)) : d.items
            }
          : d
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => {
    if (!data) return { urgent: 0, items: 0, signals: 0, sources: 0 };
    return {
      urgent: data.deadlines.filter((d) => d.next.level === "urgent" || d.next.level === "depasse").length,
      items: data.items.filter((i) => !i.handled && i.important).length,
      signals: data.signals.filter((s) => !s.handled).length,
      sources: data.sources.filter((s) => s.lastError).length
    };
  }, [data]);

  const items = data ? data.items.filter((i) => !onlyImportant || i.important) : [];
  const pill = (n: number, tone: BadgeTone = "warning") => (n > 0 ? <Badge tone={tone}>{n}</Badge> : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Veille des API"
        description="Être prévenu avant qu'un réseau, Gemini ou un service ne change son API : calendrier des versions, annonces des changelogs officiels relus chaque jour, et signaux lus dans les vraies réponses. Chaque alerte arrive aussi dans la cloche et par e-mail."
        actions={
          <Button type="button" variant="outline" onClick={() => void checkNow()} disabled={busy === "check"}>
            {busy === "check" ? "Vérification…" : "Vérifier maintenant"}
          </Button>
        }
      />
      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">{error}</p>}
      {!data ? (
        !error && <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Résumé">
            {[
              { label: "Échéances à moins de 30 jours", value: counts.urgent, tone: counts.urgent ? "text-amber-300" : "text-white" },
              { label: "Annonces importantes à lire", value: counts.items, tone: counts.items ? "text-amber-300" : "text-white" },
              { label: "Signaux non traités", value: counts.signals, tone: counts.signals ? "text-amber-300" : "text-white" },
              { label: "Sources en erreur", value: counts.sources, tone: counts.sources ? "text-red-300" : "text-white" }
            ].map((k) => (
              <GlassCard key={k.label} hover={false} className="!p-4">
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className={clsx("mt-1 font-display text-2xl font-semibold tabular-nums", k.tone)}>{k.value}</p>
              </GlassCard>
            ))}
          </div>
          {!data.emailConfigured && (
            <p className="text-xs text-slate-400">E-mails non configurés (RESEND_API_KEY) : les alertes n&apos;arrivent que dans la cloche.</p>
          )}

          <Tabs
            items={[
              { value: "calendrier", label: "Calendrier", badge: pill(counts.urgent) },
              { value: "annonces", label: "Annonces", badge: pill(counts.items) },
              { value: "signaux", label: "Signaux", badge: pill(counts.signals) },
              { value: "sources", label: "Sources", badge: pill(counts.sources, "danger") }
            ]}
            value={tab}
            onChange={setTab}
            variant="line"
            aria-label="Sections de la veille des API"
            idPrefix="veille"
          />

          <TabPanel idPrefix="veille" value="calendrier" active={tab === "calendrier"} className="space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Versions et modèles utilisés, avec leur prochaine échéance</caption>
                <thead className="bg-white/[0.03] text-xs text-slate-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">API</th>
                    <th scope="col" className="px-3 py-2 font-medium">En service</th>
                    <th scope="col" className="px-3 py-2 font-medium">Fin de vie annoncée</th>
                    <th scope="col" className="px-3 py-2 font-medium">Prochaine échéance</th>
                    <th scope="col" className="px-3 py-2 font-medium">État</th>
                  </tr>
                </thead>
                <tbody>
                  {data.deadlines.map((d) => (
                    <tr key={d.id} className="border-t border-white/[0.06] align-top">
                      <td className="px-3 py-3">
                        <a href={d.changelog} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:underline">
                          {d.label}
                        </a>
                        <p className="text-[11px] text-slate-500">{d.group}</p>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-200">
                        {d.configured ?? d.inUse}
                        {d.configured && <p className="text-[11px] text-slate-500">défaut du code : {d.inUse}</p>}
                        {d.envVar && <p className="text-[11px] text-slate-500">réglable : {d.envVar}</p>}
                      </td>
                      <td className="px-3 py-3 text-slate-300">
                        {d.sunset ? day(d.sunset) : "rien d'annoncé"}
                        {d.sunsetNote && <p className="mt-0.5 max-w-xs text-[11px] leading-snug text-slate-500">{d.sunsetNote}</p>}
                      </td>
                      <td className="px-3 py-3 text-slate-300">
                        {d.next.kind === "fin" ? "Fin de vie" : "Revue"} le {day(d.next.date)}
                        <p className="text-[11px] tabular-nums text-slate-500">{daysText(d.next.days)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={LEVEL[d.next.level].tone}>{LEVEL[d.next.level].label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <GlassCard hover={false} className="space-y-3">
              <h2 className="font-display text-base font-medium text-white">Que faire à l&apos;échéance ?</h2>
              <ul className="space-y-2 text-sm text-slate-300">
                {data.deadlines
                  .filter((d) => d.next.level !== "ok")
                  .map((d) => (
                    <li key={d.id}>
                      <strong className="text-white">{d.label}</strong> — {d.howTo}
                    </li>
                  ))}
                {data.deadlines.every((d) => d.next.level === "ok") && <li>Aucune échéance dans les 90 prochains jours.</li>}
              </ul>
              <p className="text-[11px] text-slate-500">
                Rappels automatiques à 90, 30 et 7 jours de chaque échéance, puis le jour même (cloche et e-mail). Informations vérifiées sur les sources officielles le{" "}
                {day(data.deadlines[0]?.checkedAt ?? null)} ; le calendrier se met à jour dans <code>src/lib/api-watch/registry.ts</code>.
              </p>
            </GlassCard>
            <GlassCard hover={false} className="space-y-3">
              <h2 className="font-display text-base font-medium text-white">Annonces déjà évaluées</h2>
              <ul className="space-y-3">
                {data.announcements.map((a) => (
                  <li key={`${a.apiId}-${a.date}-${a.title}`} className="text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums text-xs text-slate-500">{day(a.date)}</span>
                      <Badge tone={IMPACT_TONE[a.impact] ?? "neutral"}>impact : {a.impact}</Badge>
                      <a href={a.source} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:underline">
                        {a.title}
                      </a>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{a.detail}</p>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </TabPanel>

          <TabPanel idPrefix="veille" value="annonces" active={tab === "annonces"} className="space-y-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={onlyImportant} onChange={(e) => setOnlyImportant(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-aurora-400))]" />
              Seulement les annonces importantes (retrait, fin de vie, changement cassant)
            </label>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucune annonce nouvelle pour l&apos;instant. Le premier relevé de chaque source sert de point de départ : seules les annonces publiées ensuite apparaissent ici.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.id} className={clsx("rounded-xl border px-3 py-2.5", i.handled ? "border-white/[0.05] opacity-60" : i.important ? "border-amber-400/30 bg-amber-400/[0.04]" : "border-white/[0.07] bg-white/[0.02]")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {i.important && <Badge tone="warning">Important</Badge>}
                          <span>{i.sourceLabel}</span>
                          <span>· {day(i.publishedAt ?? i.createdAt)}</span>
                        </p>
                        {i.url ? (
                          <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-medium text-white hover:underline">
                            {i.title}
                          </a>
                        ) : (
                          <p className="mt-1 text-sm font-medium text-white">{i.title}</p>
                        )}
                        {i.excerpt && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{i.excerpt}</p>}
                      </div>
                      <Button type="button" variant="outline" className="!px-3 !py-1.5 text-xs" disabled={busy === i.id} onClick={() => void handle("item", i.id, !i.handled)} aria-pressed={i.handled}>
                        {i.handled ? "Traitée" : "Marquer traitée"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>

          <TabPanel idPrefix="veille" value="signaux" active={tab === "signaux"} className="space-y-3">
            <p className="text-sm text-slate-400">
              Lus dans les en-têtes des vraies réponses : <code>Deprecation</code>, <code>Sunset</code>, <code>X-Ad-Api-Version-Warning</code> (Meta), version Meta servie différente de la version demandée. Jamais les jetons ni le contenu.
            </p>
            {data.signals.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun signal : aucune API n&apos;annonce de retrait sur les adresses utilisées par Nebula.</p>
            ) : (
              <ul className="space-y-2">
                {data.signals.map((s) => (
                  <li key={s.id} className={clsx("rounded-xl border px-3 py-2.5", s.handled ? "border-white/[0.05] opacity-60" : "border-amber-400/30 bg-amber-400/[0.04]")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <Badge tone="warning">{SIGNAL_LABEL[s.kind] ?? s.kind}</Badge>
                          <span>{s.provider}</span>
                          <span>
                            · vu {s.count} fois, la dernière le {when(s.lastSeenAt)}
                          </span>
                        </p>
                        <p className="mt-1 break-words font-mono text-xs text-slate-300">{s.endpoint}</p>
                        <p className="mt-1 break-words text-sm text-white">{s.detail}</p>
                        {s.sunsetAt && <p className="mt-0.5 text-xs text-amber-200">Retrait annoncé le {day(s.sunsetAt)}</p>}
                      </div>
                      <Button type="button" variant="outline" className="!px-3 !py-1.5 text-xs" disabled={busy === s.id} onClick={() => void handle("signal", s.id, !s.handled)} aria-pressed={s.handled}>
                        {s.handled ? "Traité" : "Marquer traité"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>

          <TabPanel idPrefix="veille" value="sources" active={tab === "sources"} className="space-y-3">
            <p className="text-sm text-slate-400">Chaque source officielle est relue une fois par jour (deux par passage du cron). Une page sans flux est comparée au relevé précédent : les lignes nouvelles deviennent une annonce.</p>
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Sources officielles suivies et état de leur dernier relevé</caption>
                <thead className="bg-white/[0.03] text-xs text-slate-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Source</th>
                    <th scope="col" className="px-3 py-2 font-medium">Type</th>
                    <th scope="col" className="px-3 py-2 font-medium">Dernier relevé réussi</th>
                    <th scope="col" className="px-3 py-2 font-medium">État</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((s) => (
                    <tr key={s.key} className="border-t border-white/[0.06] align-top">
                      <td className="px-3 py-2.5">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-white hover:underline">
                          {s.label}
                        </a>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{s.kind === "feed" ? "Flux RSS/Atom" : "Page"}</td>
                      <td className="px-3 py-2.5 text-slate-300">{when(s.lastOkAt)}</td>
                      <td className="px-3 py-2.5">
                        {s.lastError ? (
                          <span className="text-xs text-red-300">
                            {s.lastError}
                            {s.failures > 1 ? ` (${s.failures} fois)` : ""}
                          </span>
                        ) : s.lastOkAt ? (
                          <Badge tone="success">OK</Badge>
                        ) : (
                          <Badge tone="neutral">en attente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabPanel>
        </>
      )}
    </div>
  );
}
