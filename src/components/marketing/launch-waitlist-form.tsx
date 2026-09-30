"use client";

// « Prévenez-moi du lancement » (page /bientot, pré-lancement du 30/09/2026) :
// même route et même table que les listes d'attente des réseaux
// (/api/public/waitlist, network = "lancement"), anti-robot et limite par
// adresse IP compris. Autre possibilité affichée à côté : écrire à
// l'adresse de contact.
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TURNSTILE_ENABLED, TURNSTILE_PENDING_MESSAGE, TurnstileWidget } from "@/components/turnstile-widget";
import { LAUNCH_WAITLIST, PRELAUNCH_CONTACT_EMAIL } from "@/lib/launch";
import { trackGrowthEvent } from "@/lib/growth-client";

const MAIL_SUBJECT = "Prévenez-moi du lancement de Nebula";
const MAIL_BODY = "Bonjour,\n\nJe souhaite recevoir un e-mail le jour de l'ouverture officielle de Nebula.\n\nMerci !";
export const LAUNCH_MAILTO = `mailto:${PRELAUNCH_CONTACT_EMAIL}?subject=${encodeURIComponent(MAIL_SUBJECT)}&body=${encodeURIComponent(MAIL_BODY)}`;

export function LaunchWaitlistForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse email invalide.");
      return;
    }
    if (TURNSTILE_ENABLED && !token) {
      setError(TURNSTILE_PENDING_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), network: LAUNCH_WAITLIST, consent, turnstileToken: token ?? undefined })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Enregistrement impossible.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setTurnstileReset((k) => k + 1);
    }
  }

  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-6 text-center" role="status">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-300">
          ✓
        </span>
        <p className="mt-3 font-display text-lg font-semibold text-white">C&apos;est noté !</p>
        <p className="mt-1 text-sm text-emerald-100">
          Vous recevrez un seul e-mail, le jour de l&apos;ouverture officielle. En attendant, les{" "}
          <Link href="/outils" className="font-medium underline underline-offset-2">
            outils gratuits
          </Link>{" "}
          sont déjà ouverts à tous.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6" aria-label="Être prévenu du lancement de Nebula">
      <h2 className="font-display text-lg font-semibold text-white">Prévenez-moi du lancement</h2>
      <p className="mt-1 text-sm text-slate-400">Un seul e-mail, le jour de l&apos;ouverture. Pas de relance, pas de revente.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.fr"
          aria-label="Votre email"
          autoComplete="email"
          required
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-aurora-400/60"
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? "Enregistrement…" : "Me prévenir"}
        </Button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
        <span>
          Recevoir aussi les conseils Nebula après l&apos;ouverture (facultatif, désinscription en un clic). Voir la{" "}
          <Link href="/legal#confidentialite" className="text-aurora-300 underline underline-offset-2">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>
      <TurnstileWidget onVerify={setToken} resetKey={turnstileReset} />
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="mt-auto pt-5">
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          ou par e-mail
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <p className="mt-3 text-center text-sm text-slate-300">
          Écrivez-nous à{" "}
          <a href={LAUNCH_MAILTO} onClick={() => trackGrowthEvent("conversion_block_click", { block: "bientot", cta: "mailto" })} className="font-medium text-aurora-300 underline-offset-2 hover:underline">
            {PRELAUNCH_CONTACT_EMAIL}
          </a>
          , nous vous ajoutons à la liste.
        </p>
      </div>
    </form>
  );
}
