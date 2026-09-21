"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { clsx } from "@/lib/clsx";
import { PLAN_LIMITS, type Plan, type BillingInterval, type BrandTier } from "@/lib/plans";
import { useToast } from "@/components/dashboard/toast";

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
        {fields.map(([label, value, setValue, min, max]) => (
          <div key={label}>
            <label className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
              <span>{label}</span>
              <span className="font-medium text-white">{value}</span>
            </label>
            <input
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
    <Suspense fallback={null}>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingPageInner() {
  const toast = useToast();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  // Palier "nombre de marques" sélectionné (radio) pour chaque plan payant.
  const [selectedTier, setSelectedTier] = useState<Record<Plan, number>>({
    FREE: PLAN_LIMITS.FREE.tiers[0].maxBrands,
    PRO: PLAN_LIMITS.PRO.tiers[0].maxBrands,
    AGENCY: PLAN_LIMITS.AGENCY.tiers[0].maxBrands
  });
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get("checkout");

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
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">Facturation</h1>
        <p className="mt-1 text-sm text-slate-400">Gérez l&apos;abonnement de votre compte Nebula.</p>
      </div>

      {checkoutStatus === "success" && (
        <GlassCard className="border-emerald-500/30 bg-emerald-500/[0.06]">
          <p className="text-sm text-emerald-300">
            Paiement confirmé — votre palier sera mis à jour dès que Stripe aura notifié Nebula (quelques secondes).
          </p>
        </GlassCard>
      )}

      {data && !data.billingEnabled && (
        <GlassCard className="border-white/10 bg-white/[0.02]">
          <p className="text-sm text-slate-400">
            Stripe n&apos;est pas encore configuré sur cette instance (<code className="text-aurora-300">STRIPE_SECRET_KEY</code> absent
            de .env). Les paliers restent visibles à titre indicatif, mais aucun paiement ne peut être pris tant que
            ce n&apos;est pas renseigné — voir le README.
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
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-slate-400">Marques utilisées</p>
                <p className="text-white">
                  {data.brandsOwned} / {data.maxBrands}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Par marque</p>
                <p className="text-white">
                  {data.limits.maxConnections >= 9999 ? "∞" : data.limits.maxConnections} comptes ·{" "}
                  {data.limits.maxPostsPerMonth >= 999999 ? "∞" : data.limits.maxPostsPerMonth} posts/mois
                </p>
              </div>
            </div>
            {data.plan !== "FREE" && (
              <Button variant="outline" onClick={openPortal}>
                Gérer mon abonnement
              </Button>
            )}
          </div>
        </GlassCard>
      )}

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
          Annuel <span className="text-emerald-400">— 2 mois offerts</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
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
                  soit {perMonthEquivalent}€/mois <span className="text-emerald-400/80">— moins cher qu&apos;en mensuel</span>
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
