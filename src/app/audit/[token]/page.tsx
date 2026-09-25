import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ReportView } from "@/components/audit/report-view";
import { subjectOf } from "@/lib/audit/types";
import { ButtonLink } from "@/components/ui/button";
import { auditUrl, findAudit } from "@/lib/audit/run";

// Rapport d'audit de présence, par lien secret : jamais indexé (noindex),
// rendu à chaque visite (CSP stricte), supprimé après 30 jours.
export const dynamic = "force-dynamic";

const load = cache((token: string) => findAudit(token));

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const found = await load(params.token);
  const robots = { index: false, follow: false };
  if (found.state !== "found") return { title: "Audit de présence en ligne", robots };
  const subject = subjectOf(found.result);
  const score = found.result.score.global;
  const title = score === null ? `Audit de présence — ${subject}` : `Audit de présence — ${subject} : ${score}/100`;
  return {
    title,
    description: "Score de présence, régularité, engagement, cohérence entre réseaux et conseils concrets. Audit gratuit réalisé avec Nebula.",
    robots,
    openGraph: { title, description: "Audit de présence en ligne gratuit, réalisé avec Nebula." }
  };
}

export default async function AuditReportPage({ params }: { params: { token: string } }) {
  const found = await load(params.token);
  if (found.state === "missing") notFound();
  return (
    <main id="contenu" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-nebula-mesh" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6">
        {found.state === "expired" ? (
          <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
            <h1 className="font-display text-2xl font-semibold text-white">Ce rapport a expiré</h1>
            <p className="text-sm text-slate-400">Les rapports d&apos;audit sont supprimés au bout de 30 jours. Relancez un audit : c&apos;est gratuit et il prend quelques secondes.</p>
            <ButtonLink href="/outils/audit">Lancer un nouvel audit</ButtonLink>
            <p>
              <Link href="/" className="text-xs text-slate-500 hover:text-white">
                Découvrir Nebula
              </Link>
            </p>
          </div>
        ) : (
          <ReportView token={params.token} result={found.result} advice={found.advice} expiresAt={found.row.expiresAt} shareUrl={auditUrl(params.token)} />
        )}
      </div>
    </main>
  );
}
