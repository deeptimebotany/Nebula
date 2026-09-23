"use client";

// Formulaire de liste d'attente d'un réseau à venir (brief growth, lot
// G5.d). Confirmation affichée dans la page (jamais un toast).
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TurnstileWidget } from "@/components/turnstile-widget";

export function NetworkWaitlistForm({ network, label }: { network: string; label: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse email invalide.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), network, consent, turnstileToken: token ?? undefined }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Enregistrement impossible.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-sm text-emerald-100" role="status">
        C&apos;est noté : vous recevrez un email le jour où {label} arrive dans Nebula. En attendant, votre espace gratuit vous attend.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5" aria-label={`Être prévenu de l'arrivée de ${label}`}>
      <p className="text-sm font-medium text-white">Prévenez-moi quand {label} arrive</p>
      <p className="mt-1 text-xs text-slate-400">Un seul email, le jour de l&apos;ouverture. Pas de relance.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" aria-label="Votre email" required className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60" />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? "Enregistrement…" : "Me prévenir"}
        </Button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
        <span>
          Recevoir aussi les conseils Nebula (facultatif, désinscription en un clic). Voir la{" "}
          <Link href="/legal#confidentialite" className="text-aurora-300 hover:underline">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>
      <TurnstileWidget onVerify={setToken} />
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </form>
  );
}
