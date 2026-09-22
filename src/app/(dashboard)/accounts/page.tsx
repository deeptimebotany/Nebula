"use client";

import { Suspense, useEffect, useState } from "react";
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
import { IconChart, IconCalendar, IconChevron, IconMessage, IconPlus } from "@/components/dashboard/icons";

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
}

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle,
// sinon Next.js refuse de pré-générer la page au build (même erreur que
// celle rencontrée sur /register — voir ce fichier pour le détail).
export default function AccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsPageInner />
    </Suspense>
  );
}

function AccountsPageInner() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
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
    const res = await fetch(`/api/connections?brandId=${activeBrand.id}`);
    const data = await res.json();
    const loaded: ConnectionRow[] = data.connections ?? [];
    setConnections(loaded);

    // Easter egg : les 6 réseaux disponibles connectés en même temps sur
    // cette marque (peu importe combien de comptes par réseau).
    const connectedNetworks = new Set(loaded.filter((c) => c.status === "CONNECTED").map((c) => c.network));
    if (connectedNetworks.size >= NETWORKS.length) {
      reportEasterEggFound("all-networks-connected");
    }

    fetch(`/api/billing/plan?brandId=${activeBrand.id}`)
      .then((r) => r.json())
      .then((d) => setPlanInfo(d))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand]);

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

  // Instagram et Facebook passent tous les deux par "Meta" et comptent pour
  // UN SEUL compte dans le quota (voir countConnectionSlots côté serveur,
  // src/lib/billing/plan.ts, qui applique la même règle).
  const connectionSlots =
    Math.max(
      connections.filter((c) => c.network === "INSTAGRAM").length,
      connections.filter((c) => c.network === "FACEBOOK").length
    ) +
    connections.filter((c) => c.network === "TIKTOK").length +
    connections.filter((c) => c.network === "YOUTUBE").length;

  const atLimit = planInfo ? connectionSlots >= planInfo.limits.maxConnections : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Comptes connectés</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reliez autant de comptes Facebook, Instagram, TikTok ou YouTube que vous gérez — chaque
            connexion utilise l&apos;API officielle de la plateforme.
          </p>
        </div>
        {planInfo && (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
            {connectionSlots} / {planInfo.limits.maxConnections >= 9999 ? "∞" : planInfo.limits.maxConnections}{" "}
            comptes (Instagram + Facebook comptent ensemble) · palier {planInfo.limits.label}
          </span>
        )}
      </div>

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
        {PROVIDERS.map((provider) => {
          const linked = connections.filter((c) => provider.networks.includes(c.network));
          return (
            <GlassCard key={provider.id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-medium text-white">{provider.label}</h2>
                <a href={activeBrand && !atLimit ? `/api/connections/${provider.id}/start?brandId=${activeBrand.id}` : "#"}>
                  <Button variant="outline" disabled={!activeBrand || atLimit}>
                    {linked.length > 0 ? "+ Ajouter un compte" : "Connecter"}
                  </Button>
                </a>
              </div>

              <ul className="space-y-2">
                {linked.length === 0 && <p className="text-sm text-slate-500">Aucun compte {provider.label} connecté.</p>}
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
                          <Link href={`/composer?connectionId=${c.id}`} title="Ajouter une publication pour ce compte">
                            <button className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-aurora-400/40 hover:text-white">
                              <IconPlus className="h-3.5 w-3.5" />
                            </button>
                          </Link>
                          {expiry && expiry.level !== "ok" && activeBrand && (
                            <a href={`/api/connections/${provider.id}/start?brandId=${activeBrand.id}`}>
                              <Button
                                variant="outline"
                                className={expiry.level === "expired" ? "border-red-500/40 text-red-300 hover:bg-red-500/10" : undefined}
                              >
                                Reconnecter
                              </Button>
                            </a>
                          )}
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
                            href={`/interactions?connectionId=${c.id}`}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                          >
                            <IconMessage className="h-4 w-4 text-slate-500" /> Interactions
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
