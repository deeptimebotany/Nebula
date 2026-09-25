"use client";

// Studio IA (produit n°9) : idées + accroches, et scripts de vidéo, écrits
// par l'IA à partir de ce qui marche déjà pour la marque (meilleures
// publications, heures, courbes de rétention). Choix de Lucas : une page à
// part, 15 générations par jour en Pro et 40 en Agence ; en Gratuit, les
// faits restent visibles (calculés sans IA) et « Générer » ouvre l'offre Pro.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSparkle } from "@/components/dashboard/icons";
import { useBrand } from "@/components/brand-context";
import { useUpgradeModal } from "@/components/billing/upgrade-modal";
import { FactsPanel, IdeaCard, ScriptView } from "@/components/studio/studio-parts";
import { NETWORK_META, type Network } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { generationTitle, type StudioGenerationDTO, type StudioHistoryItem, type StudioPageDTO, type StudioQuota, type VideoFormat } from "@/lib/studio/types";

type Tab = "ideas" | "script";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function StudioPage() {
  const { activeBrand } = useBrand();
  const upgrade = useUpgradeModal();
  const brandId = activeBrand?.id ?? null;
  const [data, setData] = useState<StudioPageDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ideas");
  const [network, setNetwork] = useState<Network | "">("");
  const [theme, setTheme] = useState("");
  const [subject, setSubject] = useState("");
  const [format, setFormat] = useState<VideoFormat>("court");
  const [fromIdea, setFromIdea] = useState<{ generationId: string; index: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudioGenerationDTO | null>(null);
  const [quota, setQuota] = useState<StudioQuota | null>(null);
  const [history, setHistory] = useState<StudioHistoryItem[]>([]);

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoadError(null);
    const res = await fetch(`/api/studio?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setLoadError("Impossible de charger le Studio pour le moment. Rechargez la page.");
      return;
    }
    const json = (await res.json()) as StudioPageDTO;
    setData(json);
    setQuota(json.quota);
    setHistory(json.history);
  }, [brandId]);

  useEffect(() => {
    setData(null);
    setResult(null);
    void load();
  }, [load]);

  const locked = quota !== null && quota.limit === 0;
  const composerHref = useCallback((gen: StudioGenerationDTO, index = 0) => `/composer?studio=${encodeURIComponent(gen.id)}&i=${index}`, []);
  const sourceOf = useMemo(() => {
    const map = new Map((result?.sources ?? []).map((p) => [p.ref, p]));
    return (ref: number | null) => (ref === null ? null : (map.get(ref) ?? null));
  }, [result]);

  async function generate(kind: Tab) {
    if (!brandId) return;
    if (locked) {
      upgrade.open("studio");
      return;
    }
    setBusy(true);
    setError(null);
    const input =
      kind === "ideas"
        ? { network: network || null, theme: theme.trim() }
        : { subject: subject.trim(), format, network: network || null, fromIdea };
    const res = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, kind, input }) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { generation?: StudioGenerationDTO; quota?: StudioQuota; error?: string; reason?: string };
    setBusy(false);
    if (!res?.ok || !json.generation) {
      if (res && upgrade.openFromResponse(res.status, json)) return;
      setError(json.error ?? "La génération n'a pas abouti. Réessayez dans un instant.");
      return;
    }
    setResult(json.generation);
    if (json.quota) setQuota(json.quota);
    setHistory((h) => [{ id: json.generation!.id, kind: json.generation!.kind, createdAt: json.generation!.createdAt, title: generationTitle(json.generation!.output) }, ...h].slice(0, 20));
  }

  async function openHistory(id: string) {
    if (!brandId) return;
    const res = await fetch(`/api/studio/generations/${encodeURIComponent(id)}?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setError("Ce résultat n'est plus dans l'historique.");
      return;
    }
    const json = (await res.json()) as { generation: StudioGenerationDTO };
    setResult(json.generation);
    setTab(json.generation.kind);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scriptFromIdea(gen: StudioGenerationDTO, index: number) {
    if (gen.output.kind !== "ideas") return;
    const idea = gen.output.ideas[index];
    setSubject(`${idea.title}. ${idea.angle}`);
    setFormat(idea.format);
    if (idea.network) setNetwork(idea.network);
    setFromIdea({ generationId: gen.id, index });
    setTab("script");
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const networks = data?.facts.networks ?? [];
  const quotaLine = quota
    ? locked
      ? "Aperçu : vos chiffres sont calculés sans IA. Les idées et les scripts font partie des paliers Pro et Agence."
      : `${quota.remaining} génération${quota.remaining > 1 ? "s" : ""} restante${quota.remaining > 1 ? "s" : ""} aujourd'hui sur ${quota.limit} · l'historique est gratuit`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IconSparkle className="h-5 w-5" />}
        title="Studio IA"
        description="Des idées, des accroches et des scripts de vidéo écrits à partir de ce qui marche déjà chez vous : vos meilleures publications, vos heures, vos courbes de rétention."
      />

      {loadError && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!data ? (
        <GlassCard hover={false} className="space-y-3 p-5" aria-busy="true">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </GlassCard>
      ) : (
        <FactsPanel facts={data.facts} />
      )}

      <GlassCard hover={false} className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs<Tab>
            aria-label="Type de génération"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setError(null);
            }}
            items={[
              { value: "ideas", label: "Idées et accroches" },
              { value: "script", label: "Script de vidéo" }
            ]}
          />
          {quotaLine && <p className={clsx("text-xs", locked ? "text-amber-200" : "text-slate-400")}>{quotaLine}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Réseau" value={network} onChange={(e) => setNetwork(e.target.value as Network | "")}>
            <option value="">Au choix (réseaux connectés)</option>
            {networks.map((n) => (
              <option key={n} value={n}>
                {NETWORK_META[n].label}
              </option>
            ))}
          </Select>
          {tab === "ideas" ? (
            <Input label="Thème (facultatif)" placeholder="ex. recettes rapides, coulisses, conseils débutants" value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} />
          ) : (
            <Select label="Format" value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)}>
              <option value="court">Format court (60 s ou moins)</option>
              <option value="long">Vidéo longue (8 à 12 min)</option>
            </Select>
          )}
        </div>
        {tab === "script" && (
          <Textarea
            label="Sujet de la vidéo"
            placeholder="ex. Les 3 erreurs qui rendent un café amer, et comment les corriger"
            value={subject}
            maxLength={400}
            rows={3}
            onChange={(e) => {
              setSubject(e.target.value);
              setFromIdea(null);
            }}
            hint={fromIdea ? "Repris d'une idée du Studio : modifiez-le librement." : "Une phrase suffit ; le Studio part de vos meilleures publications et de vos courbes de rétention."}
          />
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => generate(tab)} disabled={busy || !brandId || (tab === "script" && subject.trim().length < 3 && !locked)}>
            <IconSparkle className="h-4 w-4" />
            {busy ? "Écriture en cours…" : tab === "ideas" ? "Proposer 5 idées" : "Écrire le script"}
            {locked && <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-semibold">PRO</span>}
          </Button>
          {busy && <p className="text-xs text-slate-400">10 à 30 secondes : l&apos;IA lit vos chiffres et écrit.</p>}
        </div>
      </GlassCard>

      {busy && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-busy="true" aria-label="Génération en cours">
          {[0, 1].map((i) => (
            <GlassCard key={i} hover={false} className="space-y-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </GlassCard>
          ))}
        </div>
      )}

      {result && !busy && (
        <section aria-labelledby="studio-result-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="studio-result-title" className="font-display text-lg font-semibold text-white">
              {result.output.kind === "ideas" ? "Vos idées" : "Votre script"}
            </h2>
            <p className="text-xs text-slate-500">Écrit par l&apos;IA le {DATE_FMT.format(new Date(result.createdAt))} · relisez avant de publier</p>
          </div>
          {result.output.kind === "ideas" ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {result.output.ideas.map((idea, i) => (
                <IdeaCard key={i} idea={idea} index={i} source={sourceOf(idea.basedOn)} onScript={() => scriptFromIdea(result, i)} composerHref={composerHref(result, i)} />
              ))}
            </div>
          ) : (
            <ScriptView script={result.output.script} composerHref={composerHref(result)} />
          )}
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="studio-history-title" className="space-y-2">
          <h2 id="studio-history-title" className="font-display text-base font-semibold text-white">
            Historique
          </h2>
          <ul className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => openHistory(h.id)}
                  className={clsx(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                    result?.id === h.id && "bg-white/[0.04]"
                  )}
                >
                  <span className="min-w-0 max-w-full truncate text-slate-200">{h.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    {h.kind === "ideas" ? "Idées" : "Script"} · {DATE_FMT.format(new Date(h.createdAt))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
