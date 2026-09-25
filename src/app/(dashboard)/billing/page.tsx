"use client";

import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { PLAN_LIMITS, annualFreeMonths, type Plan, type BillingInterval, type BrandTier } from "@/lib/plans";
import { BeforeLeavingModal } from "@/components/billing/before-leaving-modal";
import { UpgradeGem } from "@/components/dashboard/upgrade-gem";
import { useToast } from "@/components/dashboard/toast";
import { useBootstrap } from "@/components/bootstrap-provider";
import { useBrand } from "@/components/brand-context";
import type { BrandUsage } from "@/lib/billing/usage";
import { useUsage } from "@/lib/data/hooks";

interface PlanResponse {
  plan: Plan;
  interval: BillingInterval;
  maxBrands: number;
  brandsOwned: number;
  limits: { label: string; maxConnections: number; maxPostsPerMonth: number };
  billingEnabled: boolean;
}

const PAID_PLANS: Plan[] = ["PRO", "AGENCY"];

// Calculateur de ROI : purement indicatif, basé sur des hypothèses que VOUS
// ajustez (nombre de comptes gérés, minutes passées à poster manuellement
// sur chacun, publications par mois) — aucune donnée n'est prétendue réelle,
// c'est un ordre de grandeur pour visualiser le temps qu'économise le fait
// de publier une fois sur Nebula plutôt que réseau par réseau.
function RoiCalculator() {
  const [accounts, setAccounts] = useState(4);
  const [minutesPerPost, setMinutesPerPost] = useState(6);
  const [postsPerMonth, setPostsPerMonth] = useState(20);

  const manualMinutes = accounts * minutesPerPost * postsPerMonth;
  const nebulaMinutes = minutesPerPost * postsPerMonth; // un seul post rédigé, distribué partout
  const savedHours = Math.max(0, (manualMinutes - nebulaMinutes) / 60);

  const fields: [string, number, (v: number) => void, number, number][] = [
    ["Comptes/réseaux gérés", accounts, setAccounts, 1, 50],
    ["Minutes par publication (rédaction + mise en forme par réseau)", minutesPerPost, setMinutesPerPost, 1, 60],
    ["Publications par mois", postsPerMonth, setPostsPerMonth, 1, 500]
  ];

  return (
    <GlassCard>
      <h2 className="font-display text-base font-medium text-white">Calculateur de temps économisé</h2>
      <p className="mt-1 text-sm text-slate-400">
        Ajustez les curseurs selon votre réalité — le résultat est une estimation, pas une donnée mesurée.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {fields.map(([label, value, setValue, min, max], i) => (
          <div key={label}>
            <label htmlFor={`roi-${i}`} className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{label}</span>
              <span className="font-medium text-white">{value}</span>
            </label>
            <input
              id={`roi-${i}`}
              type="range"
              min={min}
              max={max}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full accent-aurora-500"
            />
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-xs text-slate-400">Temps estimé sans Nebula (par réseau, un par un)</p>
          <p className="mt-1 font-display text-xl text-white">{Math.round(manualMinutes / 60)} h / mois</p>
        </div>
        <div className="rounded-xl border border-aurora-400/30 bg-aurora-400/[0.06] px-4 py-3">
          <p className="text-xs text-aurora-200">Temps économisé estimé avec Nebula</p>
          <p className="mt-1 font-display text-xl text-white">≈ {Math.round(savedHours)} h / mois</p>
        </div>
      </div>
    </GlassCard>
  );
}

// useSearchParams() impose un <Suspense> autour du composant qui l'appelle,
// sinon Next.js refuse de pré-générer la page au build (même erreur que
// celle rencontrée sur /register — voir ce fichier pour le détail).
export default function BillingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingPageInner() {
  const toast = useToast();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Compte à rebours de l'offre de bienvenue (-50 % premier mois, 48 h).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const [interval, setInterval] = useState<BillingInterval>("month");
  // Palier "nombre de marques" sélectionné (radio) pour chaque plan payant.
  const [selectedTier, setSelectedTier] = useState<Record<Plan, number>>({
    FREE: PLAN_LIMITS.FREE.tiers[0].maxBrands,
    PRO: PLAN_LIMITS.PRO.tiers[0].maxBrands,
    AGENCY: PLAN_LIMITS.AGENCY.tiers[0].maxBrands
  });
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get("checkout");
  // Le message technique « Stripe non configuré » ne concerne que le
  // propriétaire du site ; un client voit une phrase neutre (Lot 4).
  const { data: me, patch: patchMe } = useBootstrap();
  const { activeBrand } = useBrand();
  const offerMs = me?.offerExpiresAt ? new Date(me.offerExpiresAt).getTime() - now : 0;
  const offerCountdown =
    offerMs > 0 ? `${Math.floor(offerMs / 3600000)} h ${String(Math.floor((offerMs % 3600000) / 60000)).padStart(2, "0")} min ${String(Math.floor((offerMs % 60000) / 1000)).padStart(2, "0")} s` : null;
  const proTier = PLAN_LIMITS.PRO.tiers[0];
  // Consommation réelle de la marque active, calculée par le serveur avec
  // les mêmes règles que les quotas (voir /api/billing/usage).
  const { usage } = useUsage<BrandUsage>(activeBrand?.id);

  useEffect(() => {
    fetch("/api/billing/plan")
      .then((r) => r.json())
      .then((d: PlanResponse) => {
        setData(d);
        if (d.plan !== "FREE") {
          setInterval(d.interval);
          setSelectedTier((prev) => ({ ...prev, [d.plan]: d.maxBrands }));
        }
      });
  }, []);

  async function subscribe(plan: Plan, tier: BrandTier) {
    setLoadingTier(`${plan}-${tier.maxBrands}`);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, interval, maxBrands: tier.maxBrands })
    });
    const json = await res.json();
    setLoadingTier(null);
    if (json.url) window.location.href = json.url;
    else toast.error(json.error ?? "Erreur lors de la création de la session de paiement.");
  }

  async function openPortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else toast.error(json.error ?? "Erreur lors de l'ouverture du portail de facturation.");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Facturation" description="Gérez l'abonnement de votre compte Nebula." />

      {checkoutStatus === "success" && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.06]">
          <p className="text-sm text-emerald-300">
            Paiement confirmé — votre palier sera mis à jour dès que Stripe aura notifié Nebula (quelques secondes).
          </p>
        </GlassCard>
      )}

      {data && !data.billingEnabled && (
        <GlassCard className="border-white/10 bg-white/[0.02]">
          {me?.isOwner ? (
            <p className="text-sm text-slate-400">
              <span className="font-medium text-amber-300">Visible par vous seul :</span> Stripe n&apos;est pas configuré (
              <code className="text-aurora-300">STRIPE_SECRET_KEY</code> absent des variables d&apos;environnement). Les paliers
              restent affichés, mais aucun paiement ne peut être pris tant que la clé, les prix et le webhook ne sont pas
              renseignés sur Vercel.
            </p>
          ) : (
            <p className="text-sm text-slate-400">
              Les abonnements payants ne sont pas encore ouverts. Le palier Gratuit reste disponible sans limite de durée ;
              vous serez informé·e ici dès l&apos;ouverture.
            </p>
          )}
        </GlassCard>
      )}

      {me?.comp && (
        <GlassCard className="border-amber-400/25 bg-amber-400/[0.05]">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-200">
            <UpgradeGem className="h-3.5 w-3.5" /> Accès offert
          </p>
          <p className="mt-1 text-sm text-slate-200">
            Nebula vous offre le palier {PLAN_LIMITS[me.plan].label}
            {me.comp.until ? ` jusqu'au ${new Date(me.comp.until).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ", sans limite de durée"} — sans carte bancaire. Rien à faire de votre côté ; à la fin, vous repassez simplement au palier Gratuit, sans rien perdre.
          </p>
        </GlassCard>
      )}

      {me?.onTrial && me.trialEndsAt && !me.comp && (
        <GlassCard className="border-aurora-400/25 bg-aurora-400/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-aurora-200">
                <UpgradeGem className="h-3.5 w-3.5" /> Essai Pro
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Essai Pro jusqu&apos;au {new Date(me.trialEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — {me.trialDaysLeft} jour{me.trialDaysLeft > 1 ? "s" : ""} restant{me.trialDaysLeft > 1 ? "s" : ""}.
                Rien n&apos;est supprimé à la fin : vous repassez en Gratuit, vos données restent.
              </p>
            </div>
            <a href="#paliers" className="rounded-xl border border-aurora-400/40 px-4 py-2 text-sm font-medium text-aurora-100 transition hover:bg-aurora-400/10">
              Garder Pro
            </a>
          </div>
        </GlassCard>
      )}

      {offerCountdown && !me?.paid && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.05]">
          <p className="text-sm text-emerald-200">
            <strong>-50 % sur votre premier mois Pro</strong> ({(proTier.priceMonthly / 2).toLocaleString("fr-FR")} € au lieu de {proTier.priceMonthly} €) — expire dans <span className="tabular-nums">{offerCountdown}</span>. Sur le mensuel uniquement : l&apos;annuel a déjà ses {annualFreeMonths(proTier)} mois offerts.
          </p>
        </GlassCard>
      )}

      {me?.pausedUntil && (
        <GlassCard className="border-amber-500/30 bg-amber-500/[0.05]">
          <p className="text-sm text-amber-200">
            Abonnement en pause jusqu&apos;au {new Date(me.pausedUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} : votre compte est en Gratuit, vos données sont conservées et Stripe reprend seul à cette date.
          </p>
        </GlassCard>
      )}

      {me?.annualNudge && data?.interval === "month" && data.plan !== "FREE" && (
        <GlassCard className="border-aurora-400/25 bg-aurora-400/[0.04]">
          <p className="text-sm text-slate-200">
            Vous en êtes à votre 3e mois : passez à l&apos;annuel et gagnez <strong>{annualFreeMonths(PLAN_LIMITS[data.plan].tiers.find((t) => t.maxBrands === data.maxBrands) ?? PLAN_LIMITS[data.plan].tiers[0])} mois offerts</strong> — basculez l&apos;interrupteur Mensuel / Annuel ci-dessous puis choisissez votre palier.
          </p>
        </GlassCard>
      )}

      {data && (
        <GlassCard>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">Palier actuel</p>
              <p className="font-display text-xl text-white">
                {data.limits.label}
                {data.plan !== "FREE" && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    · jusqu&apos;à {data.maxBrands} marques · facturation {data.interval === "year" ? "annuelle" : "mensuelle"}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-slate-400">Marques</p>
                <p className="text-white">
                  {data.brandsOwned} / {data.maxBrands}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Comptes connectés{activeBrand ? ` (${activeBrand.name})` : ""}</p>
                <p className="text-white">
                  {usage ? usage.connectionSlots : "…"} / {data.limits.maxConnections >= 9999 ? "∞" : data.limits.maxConnections}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Publications ce mois-ci{activeBrand ? ` (${activeBrand.name})` : ""}</p>
                <p className="text-white">
                  {usage ? usage.postsThisMonth : "…"} / {data.limits.maxPostsPerMonth >= 999999 ? "∞" : data.limits.maxPostsPerMonth}
                </p>
              </div>
            </div>
            {(data.plan !== "FREE" || me?.pausedUntil) && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={openPortal}>
                  Gérer mon abonnement
                </Button>
                {!me?.pausedUntil && (
                  <Button variant="ghost" onClick={() => setLeaving(true)}>
                    Résilier
                  </Button>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      <BeforeLeavingModal
        open={leaving}
        onClose={() => setLeaving(false)}
        onDowngrade={openPortal}
        onPaused={(pausedUntil) => {
          patchMe({ pausedUntil, paid: false, plan: "FREE" });
          setLeaving(false);
        }}
      />

      <RoiCalculator />

      <div className="flex items-center justify-center gap-3">
        <span className={clsx("text-sm", interval === "month" ? "text-white" : "text-slate-500")}>Mensuel</span>
        <button
          onClick={() => setInterval((v) => (v === "month" ? "year" : "month"))}
          className="relative h-7 w-14 rounded-full border border-white/10 bg-white/[0.05] transition"
          aria-label="Basculer entre facturation mensuelle et annuelle"
        >
          <span
            className={clsx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-nebula-500 to-accent-cyan transition-all",
              interval === "year" ? "left-[calc(100%-1.5rem)]" : "left-0.5"
            )}
          />
        </button>
        <span className={clsx("text-sm", interval === "year" ? "text-white" : "text-slate-500")}>
          Annuel <span className="text-emerald-400">— {annualFreeMonths(proTier)} mois offerts</span>
        </span>
      </div>

      <div id="paliers" className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <GlassCard>
          <p className="font-display text-lg text-white">{PLAN_LIMITS.FREE.label}</p>
          <p className="mt-1">
            <span className="font-display text-3xl text-white">0€</span>
            <span className="text-sm text-slate-400"> / toujours</span>
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
            {PLAN_LIMITS.FREE.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          {data?.plan === "FREE" ? (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm">
              <p className="text-white">Votre plan actuel</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Géré depuis la page{" "}
                <Link href="/accounts" className="text-aurora-300 hover:underline">
                  Comptes
                </Link>
                .
              </p>
            </div>
          ) : (
            <Button className="mt-5 w-full" variant="outline" disabled>
              Inclus
            </Button>
          )}
        </GlassCard>

        {PAID_PLANS.map((planId) => {
          const p = PLAN_LIMITS[planId];
          const tier = p.tiers.find((t) => t.maxBrands === selectedTier[planId]) ?? p.tiers[0];
          const price = interval === "year" ? tier.priceYearly : tier.priceMonthly;
          const perMonthEquivalent = interval === "year" ? Math.round((tier.priceYearly / 12) * 10) / 10 : null;
          const isCurrent = data?.plan === planId && data?.interval === interval && data?.maxBrands === tier.maxBrands;
          const key = `${planId}-${tier.maxBrands}`;

          return (
            <GlassCard key={planId} className={clsx(data?.plan === planId && "border-aurora-400/50")}>
              <p className="font-display text-lg text-white">{p.label}</p>

              <div className="mt-3 space-y-1.5">
                {p.tiers.map((t) => (
                  <label
                    key={t.maxBrands}
                    className={clsx(
                      "flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition",
                      selectedTier[planId] === t.maxBrands
                        ? "border-aurora-400/50 bg-aurora-400/[0.06] text-white"
                        : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`tier-${planId}`}
                        checked={selectedTier[planId] === t.maxBrands}
                        onChange={() => setSelectedTier((prev) => ({ ...prev, [planId]: t.maxBrands }))}
                        className="accent-aurora-500"
                      />
                      jusqu&apos;à {t.maxBrands} marques
                    </span>
                    <span className="font-medium text-white">
                      {interval === "year" ? t.priceYearly : t.priceMonthly}€
                    </span>
                  </label>
                ))}
              </div>

              <p className="mt-3">
                <span className="font-display text-3xl text-white">{price}€</span>
                <span className="text-sm text-slate-400"> / {interval === "year" ? "an" : "mois"}</span>
              </p>
              {perMonthEquivalent !== null && (
                <p className="mt-0.5 text-sm font-medium text-emerald-300">
                  soit {perMonthEquivalent}€/mois <span className="text-emerald-400">— moins cher qu&apos;en mensuel</span>
                </p>
              )}

              <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
                {p.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={isCurrent ? "ghost" : "glow"}
                disabled={isCurrent || loadingTier === key}
                onClick={() => subscribe(planId, tier)}
              >
                {isCurrent ? "Palier actuel" : loadingTier === key ? "Redirection..." : `Passer à ${p.label}`}
              </Button>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
