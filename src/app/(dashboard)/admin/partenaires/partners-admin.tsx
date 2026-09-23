"use client";

// Accès offerts (partenaires, streamers, testeurs) — formulaire + liste.
// Tout se passe ici, sans Stripe : le palier est posé sur le compte
// (User.compPlan/compUntil) et lu par getUserPlan(). Pour les remises
// payantes (-50 %, -100 % sur N mois avec carte), utiliser plutôt un code
// promo créé dans Stripe : il est accepté sur la page de paiement.
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { IconGift } from "@/components/dashboard/icons";
import { useConfirm } from "@/components/dashboard/confirm";
import { PLAN_LIMITS } from "@/lib/plans";
import type { PartnerGrantRow } from "@/lib/billing/partners";

const STATUS: Record<PartnerGrantRow["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "En attente d'inscription", tone: "info" },
  active: { label: "Actif", tone: "success" },
  expired: { label: "Expiré", tone: "neutral" },
  revoked: { label: "Révoqué", tone: "danger" }
};

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function PartnersAdmin() {
  const [grants, setGrants] = useState<PartnerGrantRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"PRO" | "AGENCY">("PRO");
  const [maxBrands, setMaxBrands] = useState<number>(PLAN_LIMITS.PRO.tiers[0].maxBrands);
  const [months, setMonths] = useState<string>("3");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/partners", { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    setGrants(res.ok ? d.grants : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Le palier change → premier palier de marques de ce palier.
    setMaxBrands(PLAN_LIMITS[plan].tiers[0].maxBrands);
  }, [plan]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), plan, maxBrands, months: months === "" ? null : Number(months), note: note.trim() || undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Attribution impossible.");
      setMessage({ tone: "ok", text: d.applied ? `Accès ${PLAN_LIMITS[plan].label} activé pour ${email.trim()} — un email de confirmation lui a été envoyé.` : `Aucun compte avec cet email pour l'instant : l'accès s'activera automatiquement à son inscription.` });
      setEmail("");
      setNote("");
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!(await confirm({ title: "Révoquer cet accès ?", message: "Le compte repasse immédiatement à son palier normal. Rien n'est supprimé.", confirmLabel: "Révoquer", danger: true }))) return;
    await fetch("/api/admin/partners", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={<IconGift className="h-5 w-5" />} title="Partenaires — accès offerts" description="Offrez Pro ou Agence à un créateur, un streamer ou une entreprise partenaire, sans carte bancaire. L'accès s'applique tout de suite si le compte existe, sinon dès son inscription avec cet email." />

      <GlassCard hover={false}>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Input label="Email du partenaire" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="creatrice@exemple.fr" wrapperClassName="md:col-span-2" />
          <Select label="Palier" value={plan} onChange={(e) => setPlan(e.target.value as "PRO" | "AGENCY")}>
            <option value="PRO">{PLAN_LIMITS.PRO.label}</option>
            <option value="AGENCY">{PLAN_LIMITS.AGENCY.label}</option>
          </Select>
          <Select label="Marques" value={maxBrands} onChange={(e) => setMaxBrands(Number(e.target.value))}>
            {PLAN_LIMITS[plan].tiers.map((t) => (
              <option key={t.maxBrands} value={t.maxBrands}>
                {t.maxBrands} marques
              </option>
            ))}
          </Select>
          <Select label="Durée" value={months} onChange={(e) => setMonths(e.target.value)}>
            <option value="1">1 mois</option>
            <option value="3">3 mois</option>
            <option value="6">6 mois</option>
            <option value="12">12 mois</option>
            <option value="">Sans limite</option>
          </Select>
          <Input label="Note (interne)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : streamer Twitch, campagne octobre" maxLength={200} />
          <div className="md:col-span-6 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? "Attribution…" : "Offrir l'accès"}
            </Button>
            {message && <p className={message.tone === "ok" ? "text-sm text-emerald-300" : "text-sm text-red-300"}>{message.text}</p>}
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Pour une remise sur un abonnement payant (-50 %, -100 % pendant 3 mois avec carte enregistrée…), créez plutôt un <strong className="text-slate-300">code promo dans Stripe</strong> (Produits → Coupons → Codes promotionnels) : la personne le saisit sur la page de paiement. Les accès offerts ci-dessus ne passent pas par Stripe et s&apos;arrêtent net à la date choisie, sans facture.
        </p>
      </GlassCard>

      <GlassCard hover={false}>
        <h2 className="font-display text-base font-medium text-white">Attributions</h2>
        {grants === null ? (
          <p className="mt-3 text-sm text-slate-500">Chargement…</p>
        ) : grants.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun accès offert pour l&apos;instant.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Partenaire</th>
                  <th className="py-2 pr-3 font-semibold">Palier</th>
                  <th className="py-2 pr-3 font-semibold">Durée</th>
                  <th className="py-2 pr-3 font-semibold">Statut</th>
                  <th className="py-2 pr-3 font-semibold">Fin</th>
                  <th className="py-2 pr-3 font-semibold">Note</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2.5 pr-3">
                      <span className="block text-white">{g.email}</span>
                      {g.userName && <span className="block text-xs text-slate-500">{g.userName}</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">
                      {PLAN_LIMITS[g.plan as "PRO" | "AGENCY"]?.label ?? g.plan} · {g.maxBrands} marques
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">{g.months ? `${g.months} mois` : "Sans limite"}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-300">{g.status === "pending" ? `créé le ${fmt(g.createdAt)}` : fmt(g.expiresAt)}</td>
                    <td className="max-w-[200px] truncate py-2.5 pr-3 text-slate-400">{g.note ?? "—"}</td>
                    <td className="py-2.5 text-right">
                      {(g.status === "active" || g.status === "pending") && (
                        <button type="button" onClick={() => revoke(g.id)} className="text-xs text-red-300 hover:underline">
                          Révoquer
                        </button>
                      )}
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
