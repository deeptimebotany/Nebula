import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { GlassCard } from "@/components/ui/glass-card";
import { tiktokCapStats, type TiktokCapStats } from "@/lib/social/tiktok-cap";
import { secretsStatus } from "@/lib/prisma";
import type { SecretsStatus } from "@/lib/db/secret-fields";
import { NetworksAdmin } from "./networks-admin";

// Page propriétaire : interrupteurs par réseau et disjoncteur (lot 5).
// 404 pour tout autre compte, exclue des robots.
// 06/10/2026 : plafond TikTok des comptes qui publient (comptes différents
// sur 24 h), lien des alertes « plafond TikTok » ; état du chiffrement des
// jetons des comptes connectés (TOKEN_ENCRYPTION_KEY).
export const dynamic = "force-dynamic";
export const metadata = { title: "Réseaux — Nebula", robots: { index: false, follow: false } };

function TiktokCapCard({ stats }: { stats: TiktokCapStats }) {
  const share = Math.min(100, Math.round((stats.last24h / stats.cap) * 100));
  const level = stats.last24h >= stats.cap ? "atteint" : stats.last24h >= stats.alertAt ? "proche" : "ok";
  return (
    <GlassCard hover={false} className="space-y-2">
      <h2 className="font-display text-lg font-medium text-white">
        TikTok : comptes qui publient via Nebula
      </h2>
      <p className="text-sm text-slate-300">
        <strong className="text-white">
          {stats.last24h} / {stats.cap}
        </strong>{" "}
        comptes TikTok différents sur les dernières 24 heures ({share} % du plafond
        {level === "atteint" ? ", plafond atteint" : level === "proche" ? ", seuil d'alerte dépassé" : ""}).
      </p>
      <p className="text-sm text-slate-400">
        Maximum des 30 derniers jours :{" "}
        {stats.max30 ? `${stats.max30.peak} comptes, le ${new Date(`${stats.max30.day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}` : "aucune publication TikTok"}
        . Alerte dans la cloche et par e-mail à partir de {stats.alertAt} comptes (une fois par jour), et si TikTok refuse une publication pour ce plafond.
      </p>
    </GlassCard>
  );
}

function SecretsCard({ status }: { status: SecretsStatus }) {
  const n = (v: number) => v.toLocaleString("fr-FR");
  return (
    <GlassCard hover={false} className="space-y-2">
      <h2 className="font-display text-lg font-medium text-white">Chiffrement des jetons</h2>
      {status.enabled ? (
        <>
          <p className="text-sm text-slate-300">
            <strong className="text-emerald-300">✓ Actif</strong> (AES-256-GCM) :{" "}
            <strong className="text-white">
              {n(status.sealed)} / {n(status.total)}
            </strong>{" "}
            jetons et secrets chiffrés avec la clé actuelle.
          </p>
          {status.plain + status.otherKey > 0 && (
            <p className="text-sm text-amber-200">
              {n(status.plain + status.otherKey)} encore à chiffrer : le cron s&apos;en charge par lots de 100, en quelques minutes.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-300">
          <strong className="text-amber-300">✕ Inactif</strong> : TOKEN_ENCRYPTION_KEY n&apos;est pas configurée,{" "}
          <strong className="text-white">{n(status.plain)}</strong> jetons sont enregistrés en clair. Ajoutez la clé dans Vercel puis
          redéployez : le cron les chiffre tous en quelques minutes.
        </p>
      )}
      <p className="text-xs text-slate-500">Jetons des réseaux (TikTok, YouTube, Meta…), des intégrations et de la publicité, secrets des webhooks.</p>
    </GlassCard>
  );
}

export default async function AdminNetworksPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  const [stats, secrets] = await Promise.all([tiktokCapStats().catch(() => null), secretsStatus().catch(() => null)]);
  return (
    <div className="space-y-6">
      <NetworksAdmin />
      {stats && <TiktokCapCard stats={stats} />}
      {secrets && <SecretsCard status={secrets} />}
    </div>
  );
}
