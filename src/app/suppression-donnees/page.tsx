import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { PublicShell, PublicPageHeading } from "@/components/marketing/public-shell";
import { prisma } from "@/lib/prisma";
import { SITE_CONTACT_EMAIL } from "@/lib/site";

// Suivi d'une demande de suppression des données envoyée par Meta
// (Facebook, Instagram, Threads) — voir /api/meta/data-deletion. Page
// publique : le code de confirmation suffit, et elle ne montre aucune
// donnée personnelle (seulement l'état de la demande).
export const metadata: Metadata = {
  title: "Suppression de vos données",
  description: "Suivi d'une demande de suppression des données Facebook, Instagram ou Threads dans Nebula.",
  robots: { index: false }
};

export const dynamic = "force-dynamic";

const PROVIDERS: Record<string, string> = { META: "Facebook / Instagram", THREADS: "Threads" };

export default async function DataDeletionPage({ searchParams }: { searchParams: { code?: string } }) {
  const code = (searchParams.code ?? "").trim().toUpperCase().slice(0, 32);
  const request = /^[0-9A-F]{16}$/.test(code) ? await prisma.dataDeletionRequest.findUnique({ where: { id: code } }) : null;

  return (
    <PublicShell width="max-w-2xl">
      <PublicPageHeading eyebrow="Vos données" title="Suppression de vos données" />
      <GlassCard className="p-6 text-sm leading-relaxed text-slate-300">
        {request ? (
          <>
            <p className="text-white">
              Demande <span className="font-mono">{request.id}</span> ({PROVIDERS[request.provider] ?? request.provider}) —{" "}
              <strong className={request.status === "COMPLETED" ? "text-emerald-300" : "text-amber-300"}>
                {request.status === "COMPLETED" ? "terminée" : "en cours"}
              </strong>
              .
            </p>
            <p className="mt-3">
              {request.status === "COMPLETED"
                ? `Le ${request.completedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}, Nebula a déconnecté les comptes concernés (${request.connections}), effacé leurs jetons d'accès et supprimé les statistiques, commentaires et métriques qui en venaient.`
                : "Votre demande a été reçue et sera traitée sous peu."}
            </p>
          </>
        ) : (
          <p>
            {code ? "Ce code de suivi est inconnu. " : ""}
            Quand vous retirez Nebula des réglages de Facebook, d&apos;Instagram ou de Threads en demandant la suppression de vos données, Nebula
            déconnecte vos comptes et efface les données qui en venaient, puis vous donne un code de suivi à saisir ici.
          </p>
        )}
        <p className="mt-4 text-slate-400">
          Pour supprimer tout votre compte Nebula, utilisez Paramètres → Compte, ou écrivez à{" "}
          <a href={`mailto:${SITE_CONTACT_EMAIL}`} className="text-aurora-300 hover:underline">
            {SITE_CONTACT_EMAIL}
          </a>
          . Voir aussi la{" "}
          <Link href="/legal#confidentialite" className="text-aurora-300 hover:underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </GlassCard>
    </PublicShell>
  );
}
