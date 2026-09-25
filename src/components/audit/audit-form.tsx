"use client";

// Formulaire de l'audit de présence (/outils/audit) : jusqu'à quatre liens,
// e-mail facultatif (le rapport s'affiche tout de suite), case séparée et
// décochée pour les conseils de Nebula, anti-robot Turnstile. Pendant
// l'analyse (5 à 15 s), la liste des sources en cours ; ensuite, le rapport
// s'ouvre par un chargement complet (page à CSP stricte).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { markToolExplored } from "@/lib/tools-explored";
import { parseAuditInput, type InputErrors, type RawAuditInput } from "@/lib/audit/parse-input";
import { AUDIT_DAILY_LIMIT, AUDIT_SOURCE_LABEL, type AuditSourceKey, type SourceStatus } from "@/lib/audit/types";
import { clsx } from "@/lib/clsx";

type FieldKey = keyof RawAuditInput;

const FIELDS: { key: FieldKey; label: string; placeholder: string; hint?: string }[] = [
  { key: "youtube", label: "Chaîne YouTube", placeholder: "@votrechaine", hint: "Adresse de la chaîne ou @pseudo." },
  { key: "instagram", label: "Compte Instagram", placeholder: "@votrecompte", hint: "Comptes professionnels (Créateur ou Entreprise) seulement." },
  { key: "tiktok", label: "Compte TikTok", placeholder: "@votrecompte", hint: "Adresse du profil ou @pseudo." },
  { key: "website", label: "Site ou page de liens", placeholder: "votresite.fr", hint: "Votre site, ou votre page bio." }
];

const WORKING: Record<AuditSourceKey, string> = {
  youtube: "Lecture de la chaîne et des 30 dernières vidéos…",
  instagram: "Lecture du profil et des 25 dernières publications…",
  tiktok: "Vérification du profil…",
  website: "Lecture de la page…"
};

const STATUS_LABEL: Record<SourceStatus, string> = {
  ok: "lu",
  not_found: "introuvable",
  private: "non lisible",
  unavailable: "indisponible",
  disabled: "pas encore activé"
};

export function AuditForm({ sources }: { sources: Record<AuditSourceKey, boolean> }) {
  const fields = FIELDS.filter((f) => sources[f.key]);
  const [values, setValues] = useState<RawAuditInput>({});
  const [errors, setErrors] = useState<InputErrors & { email?: string }>({});
  const [email, setEmail] = useState("");
  const [tips, setTips] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<Partial<Record<AuditSourceKey, { status: SourceStatus; message?: string }>> | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // Retour du lien de confirmation des conseils (tool-leads.ts).
    setConfirmed(new URLSearchParams(window.location.search).get("inscription") === "confirmee");
  }, []);

  const running = (Object.keys(AUDIT_SOURCE_LABEL) as AuditSourceKey[]).filter((k) => (values[k] ?? "").trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setFailed(null);
    const parsed = parseAuditInput(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setMessage(parsed.message);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/public/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, email: email.trim(), tips: Boolean(email.trim()) && tips, turnstileToken: token ?? undefined })
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string; errors?: InputErrors & { email?: string }; sources?: typeof failed };
      if (!res.ok || !data.token) {
        setErrors(data.errors ?? {});
        setFailed(data.sources ?? null);
        setMessage(data.error ?? "L'audit n'a pas pu être lancé. Réessayez dans un instant.");
        setLoading(false);
        return;
      }
      markToolExplored("audit");
      // Chargement complet : la page du rapport a sa propre politique de sécurité (CSP stricte).
      window.location.assign(`/audit/${encodeURIComponent(data.token)}`);
    } catch {
      setMessage("Impossible de joindre Nebula pour le moment. Vérifiez votre connexion et réessayez.");
      setLoading(false);
    }
  }

  return (
    <GlassCard hover={false} className="p-5 sm:p-6">
      {confirmed && (
        <p role="status" className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-sm text-emerald-200">
          Inscription confirmée : vous recevrez les conseils de Nebula par e-mail.
        </p>
      )}
      {loading ? (
        <div role="status" aria-live="polite" className="space-y-3 py-2">
          <p className="font-display text-base font-semibold text-white">Analyse en cours…</p>
          <ul className="space-y-2">
            {running.map((k) => (
              <li key={k} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-sm">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-aurora-300/30 border-t-aurora-300 motion-reduce:animate-none" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-medium text-white">{AUDIT_SOURCE_LABEL[k]}</span>
                  <span className="block text-xs text-slate-400">{WORKING[k]}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">5 à 15 secondes. Le rapport s&apos;ouvre tout seul.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <Input
                key={f.key}
                label={f.label}
                placeholder={f.placeholder}
                hint={f.hint}
                error={errors[f.key]}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
            ))}
          </div>
          <p className="text-xs text-slate-500">Au moins un champ. Remplissez-en plusieurs pour mesurer la cohérence entre vos réseaux et votre site.</p>

          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <Input
              type="email"
              label="Recevoir le lien du rapport par e-mail (facultatif)"
              placeholder="vous@exemple.fr"
              value={email}
              error={errors.email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              hint="Seulement pour vous envoyer le lien : l'adresse n'est pas conservée avec le rapport."
            />
            <label className={clsx("flex items-start gap-2.5 text-sm", email.trim() ? "cursor-pointer text-slate-300" : "cursor-not-allowed text-slate-500")}>
              <input
                type="checkbox"
                checked={tips && Boolean(email.trim())}
                disabled={!email.trim()}
                onChange={(e) => setTips(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#8646ff]"
              />
              <span>
                Recevoir aussi quelques conseils de Nebula par e-mail
                <span className="block text-[11px] text-slate-500">Un e-mail de confirmation vous est envoyé d&apos;abord. Désinscription en un clic.</span>
              </span>
            </label>
          </div>

          <TurnstileWidget onVerify={setToken} />

          {message && (
            <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-sm text-red-200">
              <p>{message}</p>
              {failed && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-red-200/90">
                  {(Object.keys(failed) as AuditSourceKey[]).map((k) => (
                    <li key={k}>
                      {AUDIT_SOURCE_LABEL[k]} : {STATUS_LABEL[failed[k]!.status]}
                      {failed[k]!.message ? ` — ${failed[k]!.message}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" className="w-full shrink-0 whitespace-nowrap sm:w-auto">
              Lancer l&apos;audit gratuit
            </Button>
            <p className="text-xs text-slate-500">Aucune connexion de compte · données publiques · {AUDIT_DAILY_LIMIT} audits gratuits par jour</p>
          </div>
        </form>
      )}
    </GlassCard>
  );
}
