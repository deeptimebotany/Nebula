import { notFound } from "next/navigation";
import { requireOwnerUserId } from "@/lib/admin";
import { loadLaunchSummary, LAUNCH_BATCH } from "@/lib/launch-list";
import { PRELAUNCH_CONTACT_EMAIL, PRELAUNCH_DEFAULT_EMAILS } from "@/lib/launch";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { LaunchActions, LaunchRemoveButton } from "./launch-actions";

// Page propriétaire « Lancement » (pré-lancement, 30/09/2026, voir
// src/lib/launch.ts) : état du site, adresses autorisées, liste « Prévenez-
// moi du lancement » (formulaire de /bientot + adresses reçues par e-mail),
// export CSV et annonce de l'ouverture. 404 pour tout autre compte.
export const dynamic = "force-dynamic";
export const metadata = { title: "Lancement — Nebula", robots: { index: false, follow: false } };

const int = (v: number) => v.toLocaleString("fr-FR");
const fmt = (d: Date) => d.toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function AdminLaunchPage() {
  const ownerId = await requireOwnerUserId();
  if (!ownerId) notFound();
  const s = await loadLaunchSummary();
  const extra = s.allowed.filter((e) => !PRELAUNCH_DEFAULT_EMAILS.includes(e));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lancement"
        description={`Pré-lancement : inscriptions fermées, page « Bientôt » et liste des personnes à prévenir. Adresse affichée aux visiteurs : ${PRELAUNCH_CONTACT_EMAIL}.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">État du site</p>
          <p className="mt-2">{s.open ? <Badge tone="success">Ouvert à tous</Badge> : <Badge tone="warning">Pré-lancement</Badge>}</p>
          <p className="mt-2 text-xs text-slate-500">
            {s.open
              ? "Inscriptions ouvertes. /bientot redirige vers l'inscription."
              : "Inscriptions fermées. Pour ouvrir : NEXT_PUBLIC_SITE_OPEN=true dans Vercel, puis redéployer."}
          </p>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Personnes à prévenir</p>
          <p className="mt-1 font-display text-3xl text-white">{int(s.total)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {int(s.last7Days)} ces 7 derniers jours · {int(s.withTips)} veulent aussi les conseils
          </p>
        </GlassCard>
        <GlassCard hover={false}>
          <p className="text-xs uppercase tracking-wider text-slate-500">Annonce envoyée</p>
          <p className="mt-1 font-display text-3xl text-white">
            {int(s.notified)} <span className="text-base text-slate-500">/ {int(s.total)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{int(s.pending)} encore à prévenir.</p>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard hover={false}>
          <h2 className="font-display text-lg font-semibold text-white">Qui peut entrer pendant le pré-lancement</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            {s.allowed.map((e) => (
              <li key={e} className="flex items-center justify-between gap-2">
                <span className="truncate">{e}</span>
                <span className="shrink-0 text-xs text-slate-500">{PRELAUNCH_DEFAULT_EMAILS.includes(e) ? "toujours" : extra.includes(e) ? "liste réglable" : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Pour ajouter un testeur Meta ou TikTok, ou un partenaire : variable <code className="text-slate-300">PRELAUNCH_ALLOWED_EMAILS</code> dans
            Vercel (adresses séparées par des virgules), puis redéployer. La personne crée son compte depuis « Créer un compte invité » en bas de
            /bientot, ou avec Google.
          </p>
          {!s.open && s.blockedAccounts > 0 && (
            <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-xs text-amber-100">
              {int(s.blockedAccounts)} compte{s.blockedAccounts > 1 ? "s" : ""} déjà créé{s.blockedAccounts > 1 ? "s" : ""} ne peu{s.blockedAccounts > 1 ? "vent" : "t"} pas se
              connecter en ce moment. Ajoutez leurs adresses à la liste si besoin.
            </p>
          )}
        </GlassCard>

        <GlassCard hover={false}>
          <h2 className="font-display text-lg font-semibold text-white">Actions</h2>
          <LaunchActions open={s.open} pending={s.pending} batch={LAUNCH_BATCH} />
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-white">Dernières inscriptions</h2>
          {s.total > s.recent.length && <p className="text-xs text-slate-500">{int(s.recent.length)} plus récentes sur {int(s.total)} (liste complète dans l&apos;export CSV)</p>}
        </div>
        {s.recent.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Personne pour l&apos;instant. Le formulaire est sur /bientot.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Adresse</th>
                  <th className="py-2 pr-3 font-medium">Inscrit le</th>
                  <th className="py-2 pr-3 font-medium">Conseils</th>
                  <th className="py-2 pr-3 font-medium">Prévenu</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Retirer</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((r) => (
                  <tr key={r.email} className="border-t border-white/[0.06]">
                    <td className="max-w-[16rem] truncate py-2 pr-3 text-slate-200">{r.email}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-400">{fmt(r.createdAt)}</td>
                    <td className="py-2 pr-3 text-slate-400">{r.consent ? "oui" : "non"}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-400">{r.notifiedAt ? fmt(r.notifiedAt) : "—"}</td>
                    <td className="py-2 text-right">
                      <LaunchRemoveButton email={r.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
