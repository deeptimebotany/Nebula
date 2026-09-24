"use client";

// Onglet « Publicité » d'Analytics (lot 5, palier Pro/Agence) : dépenses et
// résultats Google Ads, Meta Ads et TikTok Ads au même endroit. Nebula LIT
// les chiffres (autorisation en lecture seule quand la régie le permet) et
// ne touche jamais aux campagnes ni aux budgets.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Modal } from "@/components/ui/modal";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { IconAlert, IconChart, IconLock, IconRefresh } from "@/components/dashboard/icons";
import { AD_PLATFORM_META, type AdPlatform } from "@/lib/ads/types";
import { clsx } from "@/lib/clsx";
import { AdsSpendChart, type DailyPoint } from "./ads-spend-chart";
import { useAdColors } from "./ads-colors";
import { dec, int, money, pct, relativeTime } from "./ads-format";

interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
}

interface Summary {
  platforms: { platform: AdPlatform; label: string; configured: boolean }[];
  accounts: {
    id: string;
    platform: AdPlatform;
    name: string;
    externalId: string;
    currency: string;
    status: string;
    lastError: string | null;
    lastSyncedAt: string | null;
    connectedAt: string;
    tokenExpiresAt: string | null;
  }[];
  currencies: string[];
  currency: string | null;
  range: { start: string; end: string; days: number };
  totals: Totals;
  previous: Totals | null;
  byPlatform: ({ platform: AdPlatform; label: string } & Totals)[];
  daily: DailyPoint[];
  campaigns: { id: string; name: string; status: string | null; spend: number; impressions: number; clicks: number; conversions: number; platform: AdPlatform; accountName: string }[];
}

interface AdsResponse {
  enabled: boolean;
  configured?: string[];
  plan: string;
  allowed: boolean;
  canManage: boolean;
  maxAccounts: number;
  summary: Summary | null;
  accountsCount?: number;
}

const PERIODS = [7, 30, 90] as const;

function listLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "publicitaires";
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}
const PLATFORM_SLUG: Record<AdPlatform, string> = { GOOGLE_ADS: "google", META_ADS: "meta", TIKTOK_ADS: "tiktok" };

function PlatformTag({ platform }: { platform: AdPlatform }) {
  const colors = useAdColors();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: colors[platform] }} aria-hidden="true" />
      {AD_PLATFORM_META[platform].label}
    </span>
  );
}

/** Variation vs période précédente. `goodWhenUp` : null = neutre (dépense). */
function Delta({ now, before, goodWhenUp }: { now: number | null; before: number | null | undefined; goodWhenUp: boolean | null }) {
  if (now === null || before === null || before === undefined) return null;
  if (before === 0) return now === 0 ? <span className="text-xs text-slate-500">= période précédente</span> : null;
  const change = ((now - before) / before) * 100;
  const up = change >= 0;
  const flat = Math.abs(change) < 0.5;
  const tone = flat || goodWhenUp === null ? "neutral" : up === goodWhenUp ? "good" : "bad";
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "good" && "bg-emerald-500/10 text-emerald-400",
        tone === "bad" && "bg-red-500/10 text-red-400",
        tone === "neutral" && "bg-white/[0.05] text-slate-300"
      )}
    >
      <span aria-hidden="true">{flat ? "=" : up ? "▲" : "▼"}</span>
      {flat ? "stable" : `${up ? "+" : "−"}${dec(Math.abs(change), 0)} %`}
      <span className="font-normal text-slate-400">vs période préc.</span>
    </span>
  );
}

function Kpi({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <GlassCard className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-display text-2xl font-medium tabular-nums text-white sm:text-3xl">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
      {delta}
    </GlassCard>
  );
}

function statusOf(a: Summary["accounts"][number]): { label: string; tone: "ok" | "warn" | "bad" } {
  if (a.status === "EXPIRED") return { label: "À reconnecter", tone: "bad" };
  if (a.status === "ERROR") return { label: "Erreur à la dernière synchro", tone: "warn" };
  if (!a.lastSyncedAt) return { label: "Chargement de l'historique…", tone: "warn" };
  if (a.platform === "META_ADS" && a.tokenExpiresAt && new Date(a.tokenExpiresAt).getTime() - Date.now() < 7 * 86_400_000) {
    return { label: `Expire le ${new Date(a.tokenExpiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`, tone: "warn" };
  }
  return { label: `Synchronisé ${relativeTime(a.lastSyncedAt)}`, tone: "ok" };
}

export function AdsTab({ brandId }: { brandId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [currency, setCurrency] = useState<string | null>(null);
  const [data, setData] = useState<AdsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [allCampaigns, setAllCampaigns] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ brandId, days: String(days) });
    if (currency) params.set("currency", currency);
    try {
      const res = await fetch(`/api/ads?${params}`, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as AdsResponse);
    } finally {
      setLoading(false);
    }
  }, [brandId, days, currency]);

  useEffect(() => {
    load();
  }, [load]);

  const sync = useCallback(
    async (quiet = false) => {
      setSyncing(true);
      try {
        const res = await fetch("/api/ads/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }) });
        const body = (await res.json().catch(() => ({}))) as { synced?: number; errors?: string[]; error?: string };
        if (!res.ok) throw new Error(body.error || "Synchronisation impossible.");
        if (body.errors?.length) toast.error(body.errors[0]);
        else if (!quiet) toast.success(body.synced ? "Chiffres publicitaires à jour." : "Déjà à jour (synchronisé il y a moins de 2 minutes).");
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSyncing(false);
        load();
      }
    },
    [brandId, load, toast]
  );

  // Retour d'une autorisation Google / Meta / TikTok (voir /api/ads/callback).
  useEffect(() => {
    const pending = searchParams.get("adsPending");
    const error = searchParams.get("adsError");
    if (!pending && !error) return;
    if (pending) setPendingId(pending);
    if (error) toast.error(error);
    const url = new URL(window.location.href);
    url.searchParams.delete("adsPending");
    url.searchParams.delete("adsError");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    // Une seule fois, au retour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeAccount(id: string, name: string) {
    const ok = await confirm({
      title: "Ne plus suivre ce compte ?",
      message: `Les chiffres de « ${name} » seront retirés de Nebula. Rien ne change dans votre compte publicitaire : vos campagnes continuent normalement.`,
      confirmLabel: "Retirer",
      danger: true
    });
    if (!ok) return;
    const res = await fetch(`/api/ads/accounts/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error("Impossible de retirer ce compte pour le moment.");
      return;
    }
    toast.success(`« ${name} » n'est plus suivi.`);
    load();
  }

  const summary = data?.summary ?? null;
  const configured = useMemo(() => (summary?.platforms ?? []).filter((p) => p.configured), [summary]);
  const platformsInChart = useMemo(() => (summary?.byPlatform ?? []).map((p) => p.platform), [summary]);
  const slotsLeft = summary && data ? Math.max(0, data.maxAccounts - summary.accounts.length) : 0;

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }
  if (!data || !data.enabled) {
    return <EmptyState icon={<IconChart className="h-5 w-5" />} title="Bientôt disponible" description="Le suivi de vos publicités Google, Meta et TikTok arrive très bientôt sur Nebula." />;
  }

  if (!data.allowed) {
    return (
      <GlassCard className="px-6 py-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-aurora-300">
          <IconLock className="h-5 w-5" />
        </div>
        <h3 className="font-display text-lg font-semibold text-white">Vos publicités, au même endroit que vos publications</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
          Reliez vos comptes {listLabels(data.configured ?? [])} : dépenses jour par jour, clics, coût par clic, conversions et campagnes les plus
          coûteuses, sans jongler entre plusieurs tableaux de bord. Nebula lit vos chiffres, sans jamais toucher à vos campagnes.
        </p>
        <p className="mt-3 text-xs text-slate-500">Inclus dans Pro (3 comptes publicitaires par marque) et Agence (50).</p>
        {(data.accountsCount ?? 0) > 0 && (
          <p className="mt-2 text-xs text-slate-400">Vos {data.accountsCount} compte(s) déjà reliés sont conservés : leurs chiffres réapparaîtront avec Pro ou Agence.</p>
        )}
        <ButtonLink href="/billing" className="mt-5">
          Voir les formules
        </ButtonLink>
      </GlassCard>
    );
  }

  if (!summary) return null;
  const connectButtons = data.canManage && slotsLeft > 0 && configured.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {configured.map((p) => (
        <a
          key={p.platform}
          href={`/api/ads/connect/${PLATFORM_SLUG[p.platform]}?brandId=${encodeURIComponent(brandId)}`}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:border-aurora-400/50 hover:text-white"
        >
          <span className="text-slate-500" aria-hidden="true">
            +
          </span>
          <span className="sr-only">Relier un compte</span>
          <PlatformTag platform={p.platform} />
        </a>
      ))}
    </div>
  );

  const pendingModal = pendingId && (
    <PendingAccountsModal
      id={pendingId}
      onClose={() => setPendingId(null)}
      onDone={() => {
        setPendingId(null);
        load().then(() => sync(true));
      }}
    />
  );

  if (summary.accounts.length === 0) {
    return (
      <>
        <GlassCard className="px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-aurora-300">
            <IconChart className="h-5 w-5" />
          </div>
          <h3 className="font-display text-base font-semibold text-white">Aucun compte publicitaire relié</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
            {data.canManage
              ? "Reliez un compte pour voir vos dépenses, clics et conversions ici. Nebula lit vos chiffres, sans jamais toucher à vos campagnes ni à votre budget."
              : "Le propriétaire ou un éditeur de la marque peut relier les comptes publicitaires."}
          </p>
          {connectButtons && <div className="mt-5 flex justify-center">{connectButtons}</div>}
          <p className="mt-4 text-xs text-slate-500">
            Jusqu&apos;à {data.maxAccounts} comptes par marque avec votre formule. Historique de 90 jours chargé à la connexion, puis mise à jour toutes les 12 h.
          </p>
        </GlassCard>
        {pendingModal}
      </>
    );
  }

  const t = summary.totals;
  const p = summary.previous;
  const cur = summary.currency;
  const campaigns = allCampaigns ? summary.campaigns : summary.campaigns.slice(0, 8);
  const problems = summary.accounts.filter((a) => a.status === "EXPIRED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((d) => (
            <FilterChip key={d} active={days === d} onClick={() => setDays(d)}>
              {d} jours
            </FilterChip>
          ))}
          {summary.currencies.length > 1 && (
            <span className="ml-2 flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Devise</span>
              {summary.currencies.map((c) => (
                <FilterChip key={c} active={cur === c} onClick={() => setCurrency(c)}>
                  {c}
                </FilterChip>
              ))}
            </span>
          )}
        </div>
        <Button variant="outline" onClick={() => sync()} disabled={syncing} className="py-2">
          <IconRefresh className={clsx("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Synchronisation…" : "Actualiser"}
        </Button>
      </div>

      {problems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
          <IconAlert className="h-4 w-4 shrink-0" />
          <span>
            {problems.length === 1
              ? `« ${problems[0].name} » doit être reconnecté : ses chiffres ne sont plus mis à jour.`
              : `${problems.length} comptes doivent être reconnectés : leurs chiffres ne sont plus mis à jour.`}
          </span>
          {data.canManage && (
            <a href={`/api/ads/connect/${PLATFORM_SLUG[problems[0].platform]}?brandId=${encodeURIComponent(brandId)}`} className="ml-auto text-xs font-medium underline hover:text-white">
              Reconnecter
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Dépenses" value={money(t.spend, cur)} sub={`${summary.range.days} derniers jours`} delta={<Delta now={t.spend} before={p?.spend} goodWhenUp={null} />} />
        <Kpi label="Clics" value={int(t.clicks)} sub={`Taux de clic ${pct(t.ctr)} · ${int(t.impressions)} impressions`} delta={<Delta now={t.clicks} before={p?.clicks} goodWhenUp />} />
        <Kpi label="Coût par clic" value={money(t.cpc, cur)} sub="Dépenses ÷ clics" delta={<Delta now={t.cpc} before={p?.cpc} goodWhenUp={false} />} />
        <Kpi
          label="Conversions"
          value={dec(t.conversions, t.conversions % 1 === 0 ? 0 : 1)}
          sub={t.cpa !== null ? `${money(t.cpa, cur)} par conversion` : "Achats, prospects et inscriptions"}
          delta={<Delta now={t.conversions} before={p?.conversions} goodWhenUp />}
        />
      </div>

      <GlassCard>
        <h2 className="mb-3 font-display text-base font-medium text-white">Dépenses par jour</h2>
        {platformsInChart.length > 0 ? (
          <AdsSpendChart data={summary.daily} platforms={platformsInChart} currency={cur} />
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">Pas encore de chiffres : la première synchronisation est en cours.</p>
        )}
      </GlassCard>

      {summary.byPlatform.length > 0 && (
        <GlassCard>
          <h2 className="mb-3 font-display text-base font-medium text-white">Par régie</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Régie</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Dépenses</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Impressions</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Clics</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Taux de clic</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Coût / clic</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Conversions</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">Coût / conv.</th>
                </tr>
              </thead>
              <tbody>
                {summary.byPlatform.map((row) => (
                  <tr key={row.platform} className="border-t border-white/[0.05] text-slate-200">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <PlatformTag platform={row.platform} />
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums text-white">{money(row.spend, cur)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(row.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{int(row.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(row.ctr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.cpc, cur)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dec(row.conversions, row.conversions % 1 === 0 ? 0 : 1)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{money(row.cpa, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-base font-medium text-white">Campagnes</h2>
          <span className="text-xs text-slate-500">30 derniers jours, par dépense</span>
        </div>
        {summary.campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Aucune campagne diffusée ces 30 derniers jours.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-xs text-slate-400">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Campagne</th>
                    <th scope="col" className="px-3 py-2 font-medium">Statut</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Dépenses</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Clics</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Coût / clic</th>
                    <th scope="col" className="py-2 pl-3 text-right font-medium">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={`${c.platform}-${c.id}`} className="border-t border-white/[0.05] text-slate-200">
                      <th scope="row" className="max-w-[280px] py-2 pr-3 font-normal">
                        <span className="block truncate text-white" title={c.name}>
                          {c.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <PlatformTag platform={c.platform} />
                          <span className="truncate">{c.accountName}</span>
                        </span>
                      </th>
                      <td className="px-3 py-2 text-xs text-slate-400">{c.status ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-white">{money(c.spend, cur)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{int(c.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(c.clicks > 0 ? c.spend / c.clicks : null, cur)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{dec(c.conversions, c.conversions % 1 === 0 ? 0 : 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.campaigns.length > 8 && (
              <button type="button" onClick={() => setAllCampaigns((v) => !v)} className="mt-3 text-xs text-aurora-300 hover:text-white">
                {allCampaigns ? "Voir moins" : `Voir les ${summary.campaigns.length} campagnes`}
              </button>
            )}
          </>
        )}
      </GlassCard>

      <GlassCard>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-base font-medium text-white">Comptes publicitaires</h2>
          <span className="text-xs text-slate-500">
            {summary.accounts.length} / {data.maxAccounts} avec votre formule
          </span>
        </div>
        <ul className="divide-y divide-white/[0.05]">
          {summary.accounts.map((a) => {
            const s = statusOf(a);
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <p className="truncate text-sm text-white">{a.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <PlatformTag platform={a.platform} />
                    <span>n° {a.externalId}</span>
                    <span>{a.currency}</span>
                  </p>
                </div>
                <span
                  className={clsx("flex items-center gap-1 text-xs", s.tone === "ok" && "text-slate-400", s.tone === "warn" && "text-amber-300", s.tone === "bad" && "text-red-300")}
                  title={a.lastError ?? undefined}
                >
                  {s.tone !== "ok" && <IconAlert className="h-3.5 w-3.5" />}
                  {s.label}
                </span>
                {data.canManage && (
                  <span className="flex items-center gap-1">
                    {(a.status === "EXPIRED" || s.label.startsWith("Expire")) && (
                      <a href={`/api/ads/connect/${PLATFORM_SLUG[a.platform]}?brandId=${encodeURIComponent(brandId)}`} className="rounded-lg px-2 py-1 text-xs text-aurora-300 hover:bg-white/5 hover:text-white">
                        Reconnecter
                      </a>
                    )}
                    <button type="button" onClick={() => removeAccount(a.id, a.name)} className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-red-300">
                      Retirer
                    </button>
                  </span>
                )}
                {a.status === "ERROR" && a.lastError && <p className="w-full text-xs text-slate-500">{a.lastError}</p>}
              </li>
            );
          })}
        </ul>
        {connectButtons && (
          <div className="mt-4 border-t border-white/[0.05] pt-4">
            <p className="mb-2 text-xs text-slate-500">Relier un autre compte</p>
            {connectButtons}
          </div>
        )}
      </GlassCard>

      {pendingModal}
    </div>
  );
}

// Choix des comptes à suivre après l'autorisation (un profil Google, Meta ou
// TikTok donne souvent accès à plusieurs comptes publicitaires).
function PendingAccountsModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<{
    label: string;
    slotsLeft: number;
    maxAccounts: number;
    accounts: { externalId: string; name: string; currency: string; tracked: boolean }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/ads/pending/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Connexion expirée : relancez-la.");
        setInfo(body);
        // Pré-sélection : comptes déjà suivis (reconnexion) + autant de
        // nouveaux que de places, dans l'ordre.
        const pre = new Set<string>();
        let left = body.slotsLeft as number;
        for (const a of body.accounts as { externalId: string; tracked: boolean }[]) {
          if (a.tracked) pre.add(a.externalId);
          else if (left > 0 && (body.accounts as unknown[]).length <= 3) {
            pre.add(a.externalId);
            left--;
          }
        }
        setSelected(pre);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  const newCount = info ? info.accounts.filter((a) => selected.has(a.externalId) && !a.tracked).length : 0;
  const over = info ? newCount > info.slotsLeft : false;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/ads/pending/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ externalIds: Array.from(selected) }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Enregistrement impossible.");
      toast.success("Compte(s) relié(s) : chargement des 90 derniers jours…");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    fetch(`/api/ads/pending/${id}`, { method: "DELETE" }).catch(() => undefined);
    onClose();
  }

  return (
    <Modal open onClose={cancel} title={info ? `Comptes ${info.label} à suivre` : "Comptes à suivre"}>
      {error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : !info ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-400">
            {info.slotsLeft > 0
              ? `Choisissez les comptes dont Nebula suivra les chiffres (${info.slotsLeft} place(s) restante(s) sur ${info.maxAccounts}).`
              : `Vous suivez déjà ${info.maxAccounts} comptes : vous pouvez seulement reconnecter ceux déjà suivis.`}
          </p>
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {info.accounts.map((a) => {
              const checked = selected.has(a.externalId);
              const disabled = !checked && !a.tracked && newCount >= info.slotsLeft;
              return (
                <li key={a.externalId}>
                  <label className={clsx("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition", checked ? "border-aurora-400/40 bg-white/[0.04]" : "border-white/[0.06] hover:border-white/15", disabled && "cursor-not-allowed opacity-50")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(a.externalId);
                        else next.delete(a.externalId);
                        setSelected(next);
                      }}
                      className="h-4 w-4 accent-[rgb(var(--c-aurora-400))]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{a.name}</span>
                      <span className="text-xs text-slate-500">
                        n° {a.externalId} · {a.currency}
                        {a.tracked && " · déjà suivi (sera reconnecté)"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={cancel}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || selected.size === 0 || over}>
              {saving ? "Enregistrement…" : "Suivre ces comptes"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
