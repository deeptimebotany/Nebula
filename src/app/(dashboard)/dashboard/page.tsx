"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonText } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { StatCard } from "@/components/ui/stat-card";
import { GlassCard } from "@/components/ui/glass-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { NetworkBadge, NetworkDot } from "@/components/ui/network-badge";
import { NETWORK_META, type ChartPoint, type Network } from "@/lib/types";
import { IconPlus, IconUsers, IconChart, IconHeart, IconCalendar, IconSparkle, IconUpload } from "@/components/dashboard/icons";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/reveal";
import { MotionGlassCard } from "@/components/ui/motion-glass-card";
import { LivingClock } from "@/components/dashboard/living-clock";
import { MomentumComet, computeStreak } from "@/components/dashboard/momentum-comet";
import { useCosmetics } from "@/components/cosmetics-provider";
import { OnboardingChecklist, type ChecklistStep } from "@/components/dashboard/onboarding-checklist";
import { AttentionWidget, type AttentionItem } from "@/components/dashboard/attention-widget";
import { Input } from "@/components/ui/input";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

const DRAFT_KEY_PREFIX = "nebula:composer-draft:";

const WEEKDAY_LABEL: Record<string, string> = {
  Dimanche: "le dimanche",
  Lundi: "le lundi",
  Mardi: "le mardi",
  Mercredi: "le mercredi",
  Jeudi: "le jeudi",
  Vendredi: "le vendredi",
  Samedi: "le samedi"
};

interface PerNetworkInsight {
  network: Network;
  hasEnoughData: boolean;
  bestHour: number | null;
  sampleSize: number;
}

interface InsightsResponse {
  hasEnoughData: boolean;
  sampleSize: { snapshots: number; posts: number };
  minRequired: { snapshots: number; posts: number };
  bestHour: number | null;
  bestHourScore: number | null;
  topWeekday: string | null;
  topWeekdayCount: number;
  perNetwork: PerNetworkInsight[];
}

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
  handle?: string | null;
  status: string;
}

interface AnalyticsConnection {
  id: string;
  network: Network;
  snapshots: { capturedAt: string; followers: number; reach: number; impressions: number; engagementRate: number }[];
}

interface ApiPost {
  id: string;
  title: string;
  caption: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  targets: { network: Network; status?: string }[];
}

// Cosmétique "Message d'accueil personnalisé" (voir src/lib/cosmetics.ts) :
// une variante tirée au hasard À CHAQUE VISITE (pas mémorisée) parmi ces
// phrases à thème spatial, affichée à la place du sous-titre habituel.
const GREETING_VARIANTS = [
  "Votre galaxie de contenu vous attend.",
  "Prêt·e pour une nouvelle orbite de publications ?",
  "Le cosmos Nebula tourne — à vous de le remplir.",
  "Une nouvelle constellation de posts à écrire aujourd'hui ?",
  "Direction les étoiles : qu'allez-vous publier aujourd'hui ?"
];

export default function DashboardPage() {
  const { activeBrand } = useBrand();
  const router = useRouter();
  const cosmetics = useCosmetics();
  const [greeting] = useState(() => GREETING_VARIANTS[Math.floor(Math.random() * GREETING_VARIANTS.length)]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [analyticsConnections, setAnalyticsConnections] = useState<AnalyticsConnection[]>([]);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsFailed, setInsightsFailed] = useState(false);
  const [linkPagePublished, setLinkPagePublished] = useState<boolean | null>(null);

  // Raccourci d'action rapide : rédige un brouillon minimal ici et redirige
  // vers le Composer/Importation, qui restaure automatiquement ce brouillon
  // (même clé localStorage que son propre système d'auto-sauvegarde — voir
  // composer/page.tsx) plutôt que de dupliquer la logique de publication.
  const [quickText, setQuickText] = useState("");

  function onQuickCreate() {
    if (!activeBrand) return;
    try {
      localStorage.setItem(
        DRAFT_KEY_PREFIX + activeBrand.id,
        JSON.stringify({ title: "", caption: quickText.trim(), selectedNetworks: [] })
      );
    } catch {
      // stockage indisponible — on redirige tout de même, juste sans pré-remplissage
    }
    router.push("/composer");
  }

  useEffect(() => {
    if (!activeBrand) return;
    setLoading(true);
    // Chaque appel est indépendant : si l'un échoue (réseau, serveur), les
    // autres remplissent quand même la page au lieu de tout laisser vide.
    type Loose = Record<string, unknown[] | undefined>;
    const safe = (url: string): Promise<Loose> =>
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<Loose>) : {}))
        .catch(() => ({}));
    Promise.all([
      safe(`/api/connections?brandId=${activeBrand.id}`),
      safe(`/api/analytics?brandId=${activeBrand.id}`),
      safe(`/api/posts?brandId=${activeBrand.id}`)
    ])
      .then(([conn, analytics, postsData]) => {
        setConnections((conn.connections as ConnectionRow[] | undefined) ?? []);
        setAnalyticsConnections((analytics.connections as AnalyticsConnection[] | undefined) ?? []);
        setPosts((postsData.posts as ApiPost[] | undefined) ?? []);
      })
      .finally(() => setLoading(false));
    setInsightsFailed(false);
    fetch(`/api/analytics/insights?brandId=${activeBrand.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setInsights)
      .catch(() => setInsightsFailed(true));
    fetch(`/api/link-in-bio?brandId=${activeBrand.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLinkPagePublished(d?.linkPage ? Boolean(d.linkPage.published) : false))
      .catch(() => setLinkPagePublished(false));
  }, [activeBrand]);

  const chartNetworks: Network[] = connections.map((c) => c.network);

  const chartData = useMemo(() => {
    const byDate = new Map<string, ChartPoint>();
    for (const c of analyticsConnections) {
      for (const s of c.snapshots) {
        const key = s.capturedAt.slice(5, 10);
        const point: ChartPoint = byDate.get(key) ?? { date: key };
        point[c.network] = s.followers;
        byDate.set(key, point);
      }
    }
    return Array.from(byDate.values());
  }, [analyticsConnections]);

  const hasAnalytics = analyticsConnections.some((c) => c.snapshots.length > 0);
  const totalFollowers = analyticsConnections.reduce((sum, c) => sum + (c.snapshots.at(-1)?.followers ?? 0), 0);
  const totalReach = analyticsConnections.reduce((sum, c) => sum + (c.snapshots.at(-1)?.reach ?? 0), 0);
  const avgEngagement =
    analyticsConnections.length > 0
      ? analyticsConnections.reduce((sum, c) => sum + (c.snapshots.at(-1)?.engagementRate ?? 0), 0) / analyticsConnections.length
      : 0;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const postsThisMonth = posts.filter((p) => new Date(p.createdAt) >= startOfMonth).length;

  const upcoming = posts
    .filter((p) => p.status === "SCHEDULED" && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt as string).getTime() - new Date(b.scheduledAt as string).getTime())
    .slice(0, 5);

  // Checklist de mise en route : quatre étapes réelles (voir
  // onboarding-checklist.tsx) — jamais une valeur arbitraire.
  const checklistSteps: ChecklistStep[] = [
    { key: "connect", label: "Connecter un compte", description: "Instagram, Facebook, TikTok ou YouTube.", href: "/accounts", done: connections.length > 0 },
    { key: "publish", label: "Créer une publication", description: "Immédiate ou programmée.", href: "/composer", done: posts.length > 0 },
    { key: "sync", label: "Synchroniser vos statistiques", description: "Depuis la page Analytics.", href: "/analytics", done: hasAnalytics },
    { key: "bio", label: "Publier votre page bio", description: "Vos liens importants, en bio de vos profils.", href: "/link-in-bio", done: linkPagePublished === true }
  ];

  // « À traiter » : échecs, comptes à reconnecter, brouillons.
  const failedPosts = posts.filter((p) => p.status === "FAILED" || p.status === "PARTIAL");
  const toReconnect = connections.filter((c) => c.status !== "CONNECTED");
  const drafts = posts.filter((p) => p.status === "DRAFT");
  const attentionItems: AttentionItem[] = [
    ...(failedPosts.length > 0
      ? [{ key: "failed", tone: "danger" as const, label: failedPosts.length === 1 ? "1 publication en échec" : `${failedPosts.length} publications en échec`, description: "Voir l'erreur par compte et réessayer.", href: "/publications?status=FAILED" }]
      : []),
    ...(toReconnect.length > 0
      ? [{ key: "reconnect", tone: "warning" as const, label: toReconnect.length === 1 ? `Reconnecter ${toReconnect[0].displayName}` : `${toReconnect.length} comptes à reconnecter`, description: "Leur autorisation a expiré : rien ne partira sur ces comptes.", href: "/accounts" }]
      : []),
    ...(drafts.length > 0
      ? [{ key: "drafts", tone: "neutral" as const, label: drafts.length === 1 ? "1 brouillon en attente" : `${drafts.length} brouillons en attente`, description: "Terminez-les ou supprimez-les.", href: "/publications?status=DRAFT" }]
      : [])
  ];

  // Widget "Momentum" — traînée de comète basée sur les vraies publications
  // envoyées (voir computeStreak, calculé sur `posts` déjà chargé ci-dessus).
  const streak = useMemo(() => computeStreak(posts), [posts]);

  // Widget "Meilleur créneau du jour" : prochaine heure optimale pour
  // chaque réseau connecté, basée sur son propre historique réel
  // (insights.perNetwork, voir /api/analytics/insights). Si l'heure
  // optimale d'aujourd'hui est déjà passée, on la montre pour demain.
  function nextOccurrence(hour: number): string {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, 0, 0, 0);
    const isToday = target.getTime() > now.getTime();
    return `${isToday ? "aujourd'hui" : "demain"} à ${hour}h`;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={<>Vue d&apos;ensemble{activeBrand ? ` — ${activeBrand.name}` : ""}</>}
        description={
          cosmetics.has("message-accueil-perso")
            ? greeting
            : hasAnalytics
              ? "Données réelles synchronisées depuis vos comptes connectés."
              : "Connectez un compte puis synchronisez-le (page Analytics) pour remplir ce tableau de bord."
        }
        actions={
          <ButtonLink href="/composer" className="inline-flex items-center gap-2">
            <IconPlus className="h-4 w-4" /> Nouvelle publication
          </ButtonLink>
        }
      />

      {/* Raccourcis d'action rapide : rédiger ou importer un média sans
          naviguer jusqu'à la page Publier — voir onQuickCreate. */}
      {activeBrand && (
        <GlassCard className="border-white/[0.06] bg-white/[0.015]">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Rédiger une publication"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onQuickCreate()}
              placeholder="Rédiger une publication en un clic…"
              wrapperClassName="min-w-[220px] flex-1"
            />
            <Button variant="outline" onClick={() => router.push("/composer")}>
              <IconUpload className="h-4 w-4" /> Importer un média
            </Button>
            <Button onClick={onQuickCreate} disabled={!quickText.trim()}>
              <IconPlus className="h-4 w-4" /> Créer
            </Button>
          </div>
        </GlassCard>
      )}

      {!loading && activeBrand && linkPagePublished !== null && <OnboardingChecklist brandId={activeBrand.id} steps={checklistSteps} />}

      <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevealItem>
          <StatCard
            label="Abonnés (total)"
            value={hasAnalytics ? totalFollowers.toLocaleString("fr-FR") : "—"}
            icon={<IconUsers className="h-4 w-4" />}
          />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Portée (dernière sync.)"
            value={hasAnalytics ? totalReach.toLocaleString("fr-FR") : "—"}
            suffix={hasAnalytics ? "vues" : undefined}
            icon={<IconChart className="h-4 w-4" />}
          />
        </RevealItem>
        <RevealItem>
          <StatCard
            label="Taux d'engagement"
            value={hasAnalytics ? avgEngagement.toFixed(1) : "—"}
            suffix={hasAnalytics ? "%" : undefined}
            icon={<IconHeart className="h-4 w-4" />}
          />
        </RevealItem>
        <RevealItem>
          <StatCard label="Posts ce mois-ci" value={String(postsThisMonth)} icon={<IconCalendar className="h-4 w-4" />} />
        </RevealItem>
      </RevealGroup>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Reveal>
          <AttentionWidget items={attentionItems} loading={loading} />
        </Reveal>
        <Reveal delay={0.03}>
          <MotionGlassCard className="border-aurora-400/20 bg-nebula-700/[0.08]">
            <div className="mb-2 flex items-center gap-2">
              <IconSparkle className="h-4 w-4 text-aurora-300" />
              <h2 className="font-display text-base font-medium text-white">Insights IA</h2>
            </div>
            {insightsFailed ? (
              <p className="text-sm text-slate-500">Indisponible pour le moment — réessayez en rechargeant la page.</p>
            ) : !insights ? (
              <SkeletonText lines={3} />
            ) : insights.hasEnoughData ? (
              <div className="flex flex-col gap-1.5 text-sm text-slate-300">
                {insights.bestHour !== null && (
                  <p>
                    Vos comptes progressent le mieux autour de{" "}
                    <span className="font-medium text-white">{insights.bestHour}h</span> — basé sur{" "}
                    {insights.sampleSize.snapshots} relevés analytics réels.
                  </p>
                )}
                {insights.topWeekday && (
                  <p>
                    Vous publiez surtout <span className="font-medium text-white">{WEEKDAY_LABEL[insights.topWeekday]}</span>{" "}
                    ({insights.topWeekdayCount} publication{insights.topWeekdayCount > 1 ? "s" : ""} envoyée{insights.topWeekdayCount > 1 ? "s" : ""}).
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Pas encore assez d&apos;historique pour une recommandation fiable ({insights.sampleSize.snapshots}/
                {insights.minRequired.snapshots} relevés analytics, {insights.sampleSize.posts}/{insights.minRequired.posts}{" "}
                publications envoyées). Continuez à publier et à synchroniser vos comptes (page Analytics) — ce
                widget se basera toujours sur vos vraies données, jamais sur des chiffres inventés.
              </p>
            )}
          </MotionGlassCard>
        </Reveal>

        <Reveal delay={0.05}>
          <MotionGlassCard>
            <h2 className="mb-2 font-display text-base font-medium text-white">Momentum</h2>
            <MomentumComet streak={streak} />
          </MotionGlassCard>
        </Reveal>
      </div>

      {insights && insights.perNetwork.length > 0 && insights.perNetwork.some((n) => n.hasEnoughData) && (
        <Reveal>
          <MotionGlassCard glow>
            <h2 className="mb-3 font-display text-base font-medium text-white">Meilleur créneau du jour</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {insights.perNetwork.map((n) => (
                <div key={n.network} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <LivingClock bestHour={n.bestHour} color={NETWORK_META[n.network].color} hasEnoughData={n.hasEnoughData} />
                  <div>
                    <NetworkBadge network={n.network} size="sm" />
                    {n.hasEnoughData && n.bestHour !== null ? (
                      <p className="mt-2 text-sm text-slate-300">
                        Prochain créneau :<br />
                        <span className="font-display text-base text-white">{nextOccurrence(n.bestHour)}</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        Pas encore assez d&apos;historique ({n.sampleSize} relevés).
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </MotionGlassCard>
        </Reveal>
      )}

      <RevealGroup className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <RevealItem className="lg:col-span-2">
        <MotionGlassCard>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-medium text-white">Croissance des abonnés</h2>
            <div className="flex gap-2">
              {chartNetworks.map((n) => (
                <NetworkBadge key={n} network={n} size="sm" />
              ))}
            </div>
          </div>
          {hasAnalytics ? (
            <GrowthChart data={chartData} seriesKeys={chartNetworks} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-slate-500">
                Pas encore de données — connectez un compte puis synchronisez-le pour remplir ce graphique.
              </p>
              <Link href={connections.length === 0 ? "/accounts" : "/analytics"}>
                <Button variant="outline">
                  {connections.length === 0 ? "Connecter un compte" : "Synchroniser vos comptes"}
                </Button>
              </Link>
            </div>
          )}
        </MotionGlassCard>
        </RevealItem>

        <RevealItem>
        <MotionGlassCard>
          <h2 className="mb-4 font-display text-base font-medium text-white">Comptes connectés</h2>
          {loading ? (
            <SkeletonText lines={3} />
          ) : connections.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Aucun compte connecté pour l&apos;instant.</p>
              <Link href="/accounts">
                <Button variant="outline" className="w-full">
                  Connecter un réseau
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <NetworkDot network={c.network} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{c.displayName}</p>
                    <p className="truncate text-xs text-slate-500">{c.handle ?? NETWORK_META[c.network].label}</p>
                  </div>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${c.status === "CONNECTED" ? "bg-emerald-400" : "bg-amber-400"}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </MotionGlassCard>
        </RevealItem>
      </RevealGroup>

      <Reveal>
      <MotionGlassCard>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-medium text-white">Prochaines publications</h2>
          <Link href="/calendar" className="text-sm text-aurora-300 hover:underline">
            Voir le calendrier →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune publication programmée.{" "}
            <Link href="/composer" className="text-aurora-300 hover:underline">Créez la première</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {upcoming.map((p) => {
              const scheduled = new Date(p.scheduledAt as string);
              const days = Math.round((scheduled.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const time = scheduled.toLocaleTimeString("fr-FR", { timeZone: activeBrand?.timezone ?? DEFAULT_TIMEZONE, hour: "2-digit", minute: "2-digit" });
              return (
                <Link key={p.id} href={`/posts/${p.id}`} className="glass-panel glass-panel-hover block rounded-xl p-4">
                  <p className="text-xs text-slate-500">
                    {days <= 0 ? "Aujourd'hui" : `J+${days}`} · {time}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium text-white">{p.title || p.caption || "(sans titre)"}</p>
                  <div className="mt-3 flex gap-1.5">
                    {p.targets.map((t, i) => (
                      <NetworkDot key={i} network={t.network} />
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </MotionGlassCard>
      </Reveal>
    </div>
  );
}
