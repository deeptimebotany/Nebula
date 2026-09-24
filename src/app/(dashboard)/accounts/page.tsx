"use client";

import { useAvailableNetworks } from "@/lib/use-available-networks";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBrand } from "@/components/brand-context";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/ui/network-badge";
import { NETWORK_META, NETWORKS, type Network } from "@/lib/types";
import { PROVIDERS } from "@/lib/providers";
import { reportEasterEggFound } from "@/lib/report-easter-egg";
import { clsx } from "@/lib/clsx";
import { useToast } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/dashboard/confirm";
import { UpgradeButton } from "@/components/dashboard/upgrade-gem";
import { IconChart, IconCalendar, IconChevron, IconMessage, IconPlus, IconRefresh, IconThumbUp } from "@/components/dashboard/icons";

interface ConnectionRow {
  id: string;
  network: Network;
  displayName: string;
  handle?: string | null;
  status: string;
  lastError?: string | null;
  tokenExpiresAt?: string | null;
}

const TOKEN_WARNING_DAYS = 7;

function tokenStatus(tokenExpiresAt: string | null | undefined): { level: "ok" | "soon" | "expired"; daysLeft: number } | null {
  if (!tokenExpiresAt) return null;
  const daysLeft = Math.ceil((new Date(tokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { level: "expired", daysLeft };
  if (daysLeft <= TOKEN_WARNING_DAYS) return { level: "soon", daysLeft };
  return { level: "ok", daysLeft };
}

// Indicateur de santé du jeton OAuth — toujours visible (pas seulement en cas
// de souci) pour repérer une expiration avant qu'elle ne bloque une
// publication. Vert = largement valide, orange = expire bientôt, rouge =
// expiré, gris = pas de date d'expiration connue pour ce réseau.
function TokenHealthDot({ level }: { level: "ok" | "soon" | "expired" | "unknown" }) {
  const color = level === "expired" ? "#f87171" : level === "soon" ? "#f59e0b" : level === "ok" ? "#34d399" : "#6b7280";
  const title =
    level === "expired"
      ? "Connexion expirée"
      : level === "soon"
        ? "Expire bientôt"
        : level === "ok"
          ? "Connexion saine"
          : "Durée de validité inconnue pour ce réseau";
  return <span title={title} className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

interface PlanInfo {
  plan: string;
  limits: { maxConnections: number; label: string };
  connectionSlots: number;
}

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle,
// sinon Next.js refuse de pré-générer la page au build (même erreur que
// celle rencontrée sur /register — voir ce fichier pour le détail).
export default function AccountsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountsPageInner />
    </Suspense>
  );
}

function AccountsPageInner() {
  const offeredNetworks = useAvailableNetworks();
  const { activeBrand, loading: brandLoading } = useBrand();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  // Faux tant que la liste des comptes de la marque active n'a pas été lue
  // au moins une fois. Au retour d'une connexion OAuth (YouTube, TikTok…),
  // la page se recharge entièrement : pendant les 2-3 s où la marque puis
  // les comptes se chargent, les blocs affichaient « Aucun compte connecté »
  // + un bouton « Connecter » actif — et on pouvait relancer une connexion
  // déjà faite. Tant que ce drapeau est faux, les blocs montrent un
  // chargement et le bouton est désactivé.
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  // Fournisseur dont on vient de cliquer « Connecter » : le bouton passe en
  // « Redirection… » et se désactive, le temps que le navigateur parte vers
  // la page d'autorisation (un second clic lançait un second flux OAuth).
  const [startingProvider, setStartingProvider] = useState<string | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  // Compte dont le menu déroulant (Analytics / Publié / Interactions,
  // filtrés sur lui) est actuellement ouvert — un seul à la fois, façon
  // Buffer (voir capture partagée par l'utilisateur).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const params = useSearchParams();
  const error = params.get("error");
  const connected = params.get("connected");
  const count = params.get("count");

  async function load() {
    if (!activeBrand) return;
    let loaded: ConnectionRow[] = [];
    try {
      const res = await fetch(`/api/connections?brandId=${activeBrand.id}`, { cache: "no-store" });
      const data = await res.json();
      loaded = data.connections ?? [];
      setConnections(loaded);
    } catch {
      toast.error("Impossible de charger les comptes connectés. Rechargez la page.");
    } finally {
      setConnectionsLoaded(true);
    }

    // Easter egg : les 6 réseaux disponibles connectés en même temps sur
    // cette marque (peu importe combien de comptes par réseau).
    const connectedNetworks = new Set(loaded.filter((c) => c.status === "CONNECTED").map((c) => c.network));
    if (connectedNetworks.size >= NETWORKS.length) {
      reportEasterEggFound("all-networks-connected");
    }

    // Consommation et limites calculées par le serveur (mêmes règles que le
    // quota appliqué à la connexion — voir /api/billing/usage).
    fetch(`/api/billing/usage?brandId=${activeBrand.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPlanInfo(d))
      .catch(() => undefined);
  }

  useEffect(() => {
    setConnectionsLoaded(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand]);

  function startConnect(providerId: string) {
    if (!activeBrand || startingProvider) return;
    setStartingProvider(providerId);
    window.location.assign(`/api/connections/${providerId}/start?brandId=${activeBrand.id}`);
  }

  // Retour arrière depuis la page d'autorisation (bouton Précédent) : le
  // navigateur peut restaurer la page telle quelle, bouton « Redirection… »
  // compris — on le réarme.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setStartingProvider(null);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Liste en cours de chargement : marque pas encore résolue, ou comptes de
  // cette marque pas encore lus. Sans marque du tout (compte tout neuf), on
  // n'attend rien.
  const listLoading = brandLoading || (Boolean(activeBrand) && !connectionsLoaded);

  async function disconnect(provider: string, connectionId: string, displayName: string) {
    const ok = await confirmDialog({
      title: "Déconnecter ce compte ?",
      message: `"${displayName}" ne sera plus utilisable pour publier tant qu'il ne sera pas reconnecté.`,
      confirmLabel: "Déconnecter",
      danger: true
    });
    if (!ok) return;
    await fetch(`/api/connections/${provider}?connectionId=${connectionId}`, { method: "DELETE" });
    toast.success(`"${displayName}" déconnecté.`);
    load();
  }

  // Instagram et Facebook comptent pour UN SEUL compte dans le quota : le
  // décompte vient du serveur (countConnectionSlots, via /api/billing/usage)
  // plutôt que d'être refait ici.
  const connectionSlots = planInfo?.connectionSlots ?? 0;

  const atLimit = planInfo ? connectionSlots >= planInfo.limits.maxConnections : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptes connectés"
        description="Reliez autant de comptes Facebook, Instagram, TikTok, YouTube ou Bluesky que vous gérez — chaque connexion utilise l'API officielle de la plateforme."
        actions={
          planInfo && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
              {connectionSlots} / {planInfo.limits.maxConnections >= 9999 ? "∞" : planInfo.limits.maxConnections} comptes
              (Instagram + Facebook comptent ensemble) · palier {planInfo.limits.label}
            </span>
          )
        }
      />

      {error && (
        <GlassCard className="border-red-500/30 bg-red-500/[0.06]">
          <p className="text-sm text-red-300">Connexion impossible : {error}</p>
        </GlassCard>
      )}
      {connected && !error && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.06]">
          <p className="text-sm text-emerald-300">
            {count ? `${count} compte(s) connecté(s) avec succès.` : "Compte connecté avec succès."}
          </p>
        </GlassCard>
      )}
      {atLimit && (
        <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-amber-500/30 bg-amber-500/[0.04]">
          <p className="text-sm text-amber-200">Limite de comptes atteinte pour votre palier.</p>
          <UpgradeButton size="sm" label="Passer à un palier supérieur" />
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PROVIDERS.filter((provider) => provider.networks.some((n) => offeredNetworks.includes(n)) || connections.some((c) => provider.networks.includes(c.network))).map((provider) => {
          const linked = connections.filter((c) => provider.networks.includes(c.network));
          // On revient tout juste de l'autorisation de CE fournisseur : le
          // bloc l'annonce explicitement le temps que la liste arrive.
          const finalizing = listLoading && connected === provider.id && !error;
          const starting = startingProvider === provider.id;
          const buttonDisabled = !activeBrand || atLimit || listLoading || starting;
          return (
            <GlassCard key={provider.id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-medium text-white">{provider.label}</h2>
                <Button
                  variant="outline"
                  disabled={buttonDisabled}
                  aria-busy={listLoading || starting}
                  onClick={() => startConnect(provider.id)}
                >
                  {finalizing ? (
                    <>
                      <IconRefresh className="h-4 w-4 animate-spin" /> Connexion en cours…
                    </>
                  ) : starting ? (
                    <>
                      <IconRefresh className="h-4 w-4 animate-spin" /> Redirection…
                    </>
                  ) : listLoading ? (
                    "Chargement…"
                  ) : linked.length > 0 ? (
                    "+ Ajouter un compte"
                  ) : (
                    "Connecter"
                  )}
                </Button>
              </div>

              {listLoading && (
                <div className="space-y-2" aria-busy="true" aria-live="polite">
                  {finalizing && (
                    <p className="flex items-center gap-2 text-sm text-aurora-300">
                      <IconRefresh className="h-4 w-4 shrink-0 animate-spin" />
                      Finalisation de la connexion {provider.label} — quelques secondes…
                    </p>
                  )}
                  <div className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
                    <Skeleton className="h-3.5 w-3.5 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/5" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                    <Skeleton className="h-7 w-24" />
                  </div>
                </div>
              )}

              {!listLoading && linked.length === 0 && <p className="text-sm text-slate-500">Aucun compte {provider.label} connecté.</p>}
              <ul className="space-y-2">
                {linked.map((c) => {
                  const expiry = tokenStatus(c.tokenExpiresAt);
                  const expanded = expandedId === c.id;
                  return (
                    <li key={c.id} className="rounded-lg bg-white/[0.02]">
                      <div className="flex items-center justify-between px-3 py-2">
                        <button
                          onClick={() => setExpandedId(expanded ? null : c.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          title="Analytics, Publié et Interactions pour ce compte"
                        >
                          <IconChevron
                            className={clsx("h-3.5 w-3.5 shrink-0 text-slate-500 transition", expanded && "rotate-90")}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <TokenHealthDot level={expiry?.level ?? "unknown"} />
                              <NetworkBadge network={c.network} size="sm" />
                              <p className="truncate text-sm text-white">{c.displayName}</p>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">{c.handle ?? NETWORK_META[c.network].label}</p>
                            {c.lastError && <p className="mt-0.5 text-xs text-red-400">{c.lastError}</p>}
                            {expiry && expiry.level !== "ok" && (
                              <p className={clsx("mt-0.5 text-xs", expiry.level === "expired" ? "text-red-400" : "text-amber-400")}>
                                {expiry.level === "expired"
                                  ? "Connexion expirée — reconnectez ce compte pour continuer à publier."
                                  : `Expire dans ${expiry.daysLeft} jour${expiry.daysLeft > 1 ? "s" : ""}.`}
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          {/* Raccourci "+" : ouvre directement le Composer avec CE compte
                              déjà sélectionné (et lui seul) — voir composer/page.tsx,
                              qui lit ?connectionId= au chargement. */}
                          <Link
                            href={`/composer?connectionId=${c.id}`}
                            title="Ajouter une publication pour ce compte"
                            aria-label={`Ajouter une publication pour ${c.displayName}`}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-aurora-400/40 hover:text-white"
                          >
                            <IconPlus className="h-3.5 w-3.5" />
                          </Link>
                          <Button variant="ghost" onClick={() => disconnect(provider.id, c.id, c.displayName)}>
                            Déconnecter
                          </Button>
                        </div>
                      </div>

                      {/* Menu déroulant façon Buffer : mêmes onglets que la navigation
                          principale (Analytics, Calendrier = "Publié", Interactions),
                          chacun filtré sur ce seul compte via ?connectionId=. */}
                      {expanded && (
                        <div className="space-y-0.5 border-t border-white/[0.06] px-3 py-2">
                          <Link
                            href={`/analytics?connectionId=${c.id}`}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                          >
                            <IconChart className="h-4 w-4 text-slate-500" /> Analytics
                          </Link>
                          <Link
                            href={`/calendar?connectionId=${c.id}`}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                          >
                            <IconCalendar className="h-4 w-4 text-slate-500" /> Publié
                          </Link>
                          <Link
                            href={`/comments?connectionId=${c.id}`}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                          >
                            <IconMessage className="h-4 w-4 text-slate-500" /> Commentaires
                          </Link>
                          <Link
                            href={`/engagements?connectionId=${c.id}`}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                          >
                            <IconThumbUp className="h-4 w-4 text-slate-500" /> Engagements
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-slate-500">
                {provider.networks.map((n) => NETWORK_META[n].requiresAudit).filter(Boolean)[0]}
              </p>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
