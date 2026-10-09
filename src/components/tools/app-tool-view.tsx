"use client";

// Un outil dans l'application (02/10/2026) : mêmes outils que /outils, mais
// dans le tableau de bord et préremplis avec la marque active (GET
// /api/tools/context, calculé dans src/lib/tools/app-context.ts). Changer de
// marque recharge le préremplissage. L'IA passe par la même route que les
// outils publics (/api/public/tools/generate) : quota du palier du compte.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBrand } from "@/components/brand-context";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { ButtonLink } from "@/components/ui/button";
import { AuditForm } from "@/components/audit/audit-form";
import { EngagementCalculator } from "@/components/tools/bodies/engagement-calculator";
import { BestTimeTable } from "@/components/tools/bodies/best-time-table";
import { BioGenerator } from "@/components/tools/bodies/bio-generator";
import { HashtagGenerator } from "@/components/tools/bodies/hashtag-generator";
import { TitleTester } from "@/components/tools/bodies/title-tester";
import { toolBySlug, type ToolSlug } from "@/components/tools/tool-catalog";
import type { AuditSourceKey } from "@/lib/audit/types";
import { accountLabel, engagementPresets, type ToolAccountDTO, type ToolContextDTO } from "@/lib/tools/app-context-shared";

export function AppToolView({ slug, auditSources }: { slug: Exclude<ToolSlug, "publier">; auditSources?: Record<AuditSourceKey, boolean> }) {
  const tool = toolBySlug(slug)!;
  const { activeBrand, loading: brandLoading } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const [ctx, setCtx] = useState<{ brandId: string; data: ToolContextDTO } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/tools/context?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as ToolContextDTO | null;
        if (cancelled) return;
        if (!res.ok || !data) setError("Impossible de charger les données de votre marque. Vous pouvez remplir l'outil à la main.");
        setCtx({ brandId, data: data && res.ok ? data : EMPTY_CONTEXT });
      })
      .catch(() => {
        if (cancelled) return;
        setError("Impossible de charger les données de votre marque. Vous pouvez remplir l'outil à la main.");
        setCtx({ brandId, data: EMPTY_CONTEXT });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const header = (
    <PageHeader
      icon={<tool.icon className="h-5 w-5" />}
      title={tool.title}
      description={tool.appDesc}
      breadcrumb={[{ label: "Outils", href: "/tools" }, { label: tool.title }]}
      actions={
        <Link href={tool.publicHref} target="_blank" rel="noopener" className="text-xs text-slate-400 hover:text-white hover:underline">
          Version publique, sans compte ↗
        </Link>
      }
    />
  );

  if (brandLoading || (brandId && (!ctx || ctx.brandId !== brandId))) {
    return (
      <div className="space-y-6">
        {header}
        <PageSkeleton />
      </div>
    );
  }

  const data = ctx?.data ?? EMPTY_CONTEXT;
  const key = brandId ?? "aucune";
  const noData = data.accounts.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {header}
      {error && <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">{error}</p>}
      {noData && (slug === "taux-engagement" || slug === "meilleur-moment" || slug === "audit") && (
        <GlassCard hover={false} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-300">Connectez un compte Instagram, Facebook, TikTok ou YouTube pour que l&apos;outil se remplisse avec vos vrais chiffres.</p>
          <ButtonLink href="/accounts">Connecter un compte</ButtonLink>
        </GlassCard>
      )}
      {slug === "taux-engagement" && <EngagementTool key={key} accounts={data.accounts} />}
      {slug === "meilleur-moment" && (
        <BestTimeTable key={key} initialNetwork={data.accounts[0]?.network} initialTimezone={data.brand.timezone} personal={{ slots: data.bestTimes, minSnapshots: data.minSnapshots }} />
      )}
      {slug === "bio-instagram" && <BioGenerator key={key} initialActivity={data.about} />}
      {slug === "hashtags" && <HashtagGenerator key={key} initialNiche={data.about || data.brand.name} initialNetwork={data.accounts[0]?.network ?? ""} />}
      {slug === "titre-youtube" && <TitleTester key={key} suggestions={data.youtubeTitles} />}
      {slug === "audit" && auditSources && <AuditForm key={key} sources={auditSources} initialValues={data.audit} />}
    </div>
  );
}

function EngagementTool({ accounts }: { accounts: ToolAccountDTO[] }) {
  const presets = engagementPresets(accounts);
  const missing = accounts.filter((a) => !presets.some((p) => p.id === a.connectionId));
  return (
    <>
      <EngagementCalculator presets={presets} />
      {missing.length > 0 && (
        <p className="text-xs text-slate-500">
          Pas encore de chiffres relevés pour {missing.map(accountLabel).join(", ")} : ouvrez{" "}
          <Link href="/interactions?vue=engagement" className="text-aurora-300 hover:underline">
            Engagements
          </Link>{" "}
          et cliquez sur « Actualiser », ou attendez le prochain relevé automatique.
        </p>
      )}
    </>
  );
}

const EMPTY_CONTEXT: ToolContextDTO = {
  brand: { name: "", timezone: "Europe/Paris" },
  about: "",
  accounts: [],
  bestTimes: [],
  minSnapshots: 5,
  youtubeTitles: [],
  audit: {}
};
